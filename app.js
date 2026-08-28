const offVideos = Array.from(document.querySelectorAll(".off-video"));
const onVideos = Array.from(document.querySelectorAll(".on-video"));
const videos = [...offVideos, ...onVideos];
const audios = Array.from(document.querySelectorAll(".loop-audio"));
const screens = Array.from(document.querySelectorAll(".screen"));
const faders = Array.from(document.querySelectorAll(".volume"));
const channelEls = Array.from(document.querySelectorAll(".channel"));
const videoRow = document.querySelector(".video-row");
const bgLoop = document.querySelector(".bg-loop");
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

const active = [false, false, false, false];
// Each channel's own level, independent of whether it is currently in the
// mix. Set a fader while a channel is out and the level is waiting for it
// when you bring it back in.
const levels = faders.map((f) => Number(f.value));
let started = false;

// The song is deliberately not running yet when the session opens. The idle
// takes loop from the moment you press Start, but the four audio loops and
// the four performance takes stay parked at their first frame until a
// channel is actually brought in, so the music is heard from the top of the
// loop rather than dropped into the middle of a bar. Everything below is
// about that one moment.
let loopsRunning = false;
let loopStartedAt = 0;
let loopDuration = 0;

// How far into the future audio playback is scheduled (seconds). Web Audio
// needs a small lookahead so all four source.start() calls land before the
// scheduled instant even if the main thread stalls; the performance takes
// are delayed by the same amount so they don't run ahead of the beat.
const START_LOOKAHEAD = 0.2;

// Target gain for the idle room-tone loop — quiet, a bed for the empty
// stage rather than something you'd notice on its own.
const AMBIENT_LEVEL = 0.35;

// Videos are visual only — the audio for each channel is played through
// Web Audio (below), never through the <video> tags themselves, so video
// stays muted permanently and only its visibility toggles.
videos.forEach((v) => { v.muted = true; });

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContextClass();

// One gain node per channel controls that channel's volume; it's what
// toggling actually touches. All four channels stay muted (gain 0) until
// activated.
const gains = audios.map(() => {
  const g = audioCtx.createGain();
  g.gain.value = 0;
  g.connect(audioCtx.destination);
  return g;
});

// The idle room-tone loop has its own gain node for the same reason each
// channel does — so bringing it in or out is a ramp, not a click — but it
// isn't one of the four channels: it plays while none of them are, not
// while any particular one is.
const ambientAudio = document.querySelector(".ambient-audio");
const ambientGain = audioCtx.createGain();
ambientGain.gain.value = 0;
ambientGain.connect(audioCtx.destination);

// Served from a file the page fetches; in the self-contained build the loops
// are inlined as data: URIs instead, where there is no request to make and a
// locked-down connect-src would block fetch() from reading them anyway. Both
// end up as an ArrayBuffer.
function loadAudioBytes(src) {
  if (src.startsWith("data:")) {
    const base64 = src.slice(src.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return Promise.resolve(bytes.buffer);
  }
  return fetch(src).then((res) => res.arrayBuffer());
}

// Decoding doesn't require a user gesture (only starting playback does), so
// kick it off immediately at load time — by the time a channel is brought in
// the buffers are already decoded and the song can start with no delay.
const bufferPromises = audios.map((a) =>
  loadAudioBytes(a.currentSrc || a.src).then((buf) => audioCtx.decodeAudioData(buf))
);

const ambientBufferPromise = ambientAudio
  ? loadAudioBytes(ambientAudio.currentSrc || ambientAudio.src).then((buf) => audioCtx.decodeAudioData(buf))
  : null;

// --- Audio-reactive glow --------------------------------------------------
//
// Each tile's border blooms outward in time with that channel's OWN audio,
// never a combined "master" signal — with all four channels in the mix,
// each tile still visibly follows its own part rather than one shared pulse.
//
// The loudness curve is computed once, right after a channel's buffer is
// available, rather than analysed live every frame. The loop repeats an
// identical waveform forever, so live analysis would only ever rediscover
// what's already fully knowable up front, and precomputing turns the
// per-frame cost into a single array lookup instead of continuous FFT work
// on four channels at once.
const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Per-channel attack/release, in ms. Attack is fast everywhere so a hit
// registers instantly; release is what gives each instrument its own
// character on screen — short for the percussive channels so consecutive
// hits stay visually distinct, longer for the more sustained ones so the
// glow doesn't flicker between notes. Tune these by ear once it's running.
const GLOW_SHAPE = [
  { attackMs: 4, releaseMs: 130 }, // 0 drums
  { attackMs: 6, releaseMs: 190 }, // 1 guitars
  { attackMs: 8, releaseMs: 260 }, // 2 bass
  { attackMs: 8, releaseMs: 260 }, // 3 synths
];

let envelopes = [];

function averageChannels(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const a = buffer.getChannelData(0);
  const b = buffer.getChannelData(1);
  const mono = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) * 0.5;
  return mono;
}

// One value per ~11.6ms window (512 samples at 44.1kHz) — comfortably finer
// than a single video frame, while keeping the array small (~1300 points
// for this 15.36s loop).
function computeEnvelope(buffer, { attackMs, releaseMs }) {
  const HOP = 512;
  const data = averageChannels(buffer);
  const hops = Math.ceil(data.length / HOP);
  const raw = new Float32Array(hops);

  for (let i = 0; i < hops; i++) {
    const start = i * HOP;
    const end = Math.min(start + HOP, data.length);
    let sumSquares = 0;
    for (let j = start; j < end; j++) sumSquares += data[j] * data[j];
    raw[i] = Math.sqrt(sumSquares / (end - start));
  }

  const dt = HOP / buffer.sampleRate;
  const attackCoeff = 1 - Math.exp(-dt / (attackMs / 1000));
  const releaseCoeff = 1 - Math.exp(-dt / (releaseMs / 1000));

  // Shaped in two passes around the loop rather than one from a standing
  // start: playback picks back up at index 0 on every single repeat, so the
  // shaping needs to already be mid-stride there. A single pass would open
  // with an artificial swell that never recurs on any later loop.
  const shaped = new Float32Array(hops);
  let level = raw[hops - 1];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < hops; i++) {
      const coeff = raw[i] > level ? attackCoeff : releaseCoeff;
      level += (raw[i] - level) * coeff;
      shaped[i] = level;
    }
  }

  let peak = 0;
  for (let i = 0; i < hops; i++) if (shaped[i] > peak) peak = shaped[i];
  if (peak > 0) for (let i = 0; i < hops; i++) shaped[i] /= peak;

  return { values: shaped, dt };
}

function envelopeValueAt(envelope, phaseSeconds) {
  const { values, dt } = envelope;
  const pos = phaseSeconds / dt;
  const i0 = Math.floor(pos) % values.length;
  const i1 = (i0 + 1) % values.length;
  const t = pos - Math.floor(pos);
  return values[i0] * (1 - t) + values[i1] * t;
}

function tickGlow() {
  if (loopsRunning && loopDuration && envelopes.length) {
    const elapsed = audioCtx.currentTime - loopStartedAt;
    if (elapsed >= 0) {
      const phase = elapsed % loopDuration;
      envelopes.forEach((env, i) => {
        if (env) channelEls[i].style.setProperty("--glow", envelopeValueAt(env, phase).toFixed(3));
      });
    }
  }
  requestAnimationFrame(tickGlow);
}

if (!REDUCE_MOTION) requestAnimationFrame(tickGlow);

// A channel is audible at its own level only while it is in the mix, so the
// toggle and the fader both resolve through here. Ramped rather than
// switched, to avoid a click. On the very first activation this runs before
// the song has actually started, which is what we want: the gain is already
// up by the time the first sample plays, so the loop opens at its level
// instead of fading up into its own first bar.
function applyLevel(index, seconds = 0.03) {
  const g = gains[index].gain;
  const now = audioCtx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(active[index] ? levels[index] : 0, now + seconds);
}

function setTileState(index, isActive) {
  active[index] = isActive;
  screens[index].classList.toggle("active", isActive);
  screens[index].setAttribute("aria-pressed", String(isActive));
  applyLevel(index);

  // The glow is the payoff for bringing in the whole band, not a per-channel
  // indicator — it stays off at one, two, or three channels and only lights
  // up once all four are in, replacing the old jump-scare cat for that same
  // moment. Gated by one class on the shared container rather than each
  // .screen's own .active state, since with all four active every .screen
  // is active anyway — this is just the one flag CSS needs to show all four
  // glows together instead of each tile deciding for itself.
  const allActive = active.every(Boolean);
  videoRow.classList.toggle("all-active", allActive);

  // The psychedelic backdrop is the same "whole band" payoff as the glow,
  // just staged behind the page instead of on the tiles, so it's gated by
  // the same condition. It runs on its own clock — it isn't part of the
  // phase-locked mix — so bringing it in is just a play/pause, paused
  // rather than reset when it drops so it picks back up where it left off.
  if (bgLoop && !REDUCE_MOTION) {
    document.body.classList.toggle("all-active", allActive);
    if (allActive) bgLoop.play().catch(() => {});
    else bgLoop.pause();
  }

  // Room tone for the empty stage: audible while no channel is in the mix,
  // ramped out the moment any one of them is, same as a channel's own gain
  // and for the same reason — a click-free fade rather than a hard cut.
  const g = ambientGain.gain;
  const now = audioCtx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(active.some(Boolean) ? 0 : AMBIENT_LEVEL, now + 0.6);
}

// Starts the song. Runs once, on the first channel brought in — every later
// toggle only moves a gain, so nothing ever restarts and the four channels
// stay phase-locked to each other for the rest of the session.
async function beginLoops() {
  if (loopsRunning) return;
  loopsRunning = true;

  try {
    await audioCtx.resume();
    const buffers = await Promise.all(bufferPromises);

    // Every loop is scheduled to begin at the exact same audio-clock
    // instant. Web Audio scheduling is sample-accurate, and each loop's end
    // point is defined against that same clock, so all four stay
    // phase-locked forever — no periodic re-sync needed, unlike
    // HTMLMediaElement playback/looping, which gives no such guarantee.
    const startAt = audioCtx.currentTime + START_LOOKAHEAD;
    loopStartedAt = startAt;
    loopDuration = buffers[0].duration;

    buffers.forEach((buffer, i) => {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = buffer.duration;
      source.connect(gains[i]);
      source.start(startAt);
    });

    // Video has no equivalent "start at this exact future instant" API, so
    // it's delayed with setTimeout instead — otherwise it would start
    // immediately while audio is still waiting out its scheduling
    // lookahead, leaving video visibly ahead of the beat. setTimeout's delay
    // counts from the moment it's called, so this line has to run right
    // after scheduling with nothing synchronous between them — envelope
    // computation below waits until after, precisely to avoid delaying it.
    // The performance takes have been rolling invisibly since Start, so
    // normally this is just a seek back to their first frame — they restart
    // from the top alongside the audio. reanchorTakes() also re-calls
    // .play(), which is a no-op on an already-playing take (seeking one
    // takes about 20ms and never drops readyState) and only actually
    // matters for the edge case of a take having sat idle long enough to
    // reach its own end and pause first. Not started from a standstill on
    // purpose either way: calling play() on four idle videos at once took
    // over a second to produce a frame, which would have left the picture
    // trailing the downbeat.
    setTimeout(() => {
      reanchorTakes();
      keepTakesOnTheAudioLoop();
    }, START_LOOKAHEAD * 1000);

    // Not time-critical, unlike everything above: every source is already
    // scheduled for a fixed future instant regardless of when this runs, and
    // the setTimeout just above is already registered.
    if (!REDUCE_MOTION) {
      envelopes = buffers.map((buffer, i) => computeEnvelope(buffer, GLOW_SHAPE[i]));
    }
  } catch (err) {
    loopsRunning = false;
    console.error("Failed to start the loops", err);
  }
}

// The takes don't carry the browser's native `loop` attribute (see the
// on-video markup) — left to it, Chromium restarts a take up to ~95ms
// before the duration it reports, an internal heuristic with no idea where
// the audio actually is, and that showed up as the picture visibly running
// ahead of the beat. Two other fixes were tried and both failed:
//
//   - Correcting by seeking to the audio's current phase. These takes carry a
//     single keyframe, so any non-zero seek decodes from the top: a seek to 0
//     costs ~10ms, one to 5s cost over five seconds, one to 9s never finished.
//     The picture froze for the whole correction interval and drifted further
//     on every pass.
//   - Correcting with playbackRate. The webm's real loop period is about 95ms
//     shorter than the duration it reports, so the ratio is not knowable up
//     front, and a duration-derived rate made the drift ten times worse.
//
// What is cheap is seeking to zero. So every take is re-anchored there and
// resumed the moment the audio loop turns over, which is both the one seek
// the format is fast at and the moment a small discontinuity is least
// visible. With the native attribute gone, that's now the only thing that
// ever restarts a take, so it can no longer run ahead on its own — the poll
// below is what it's waiting on, so it runs every 20ms rather than 100 to
// keep that wait short enough not to read as a stutter. `ended` is a second,
// per-take trigger for the same reset, for the rare case a take reaches its
// own last frame and pauses before the next poll. The seek itself is
// skipped when a take is already sitting on frame 0 (the first-activation
// path above pre-seeks the newly toggled take for exactly this reason) --
// re-seeking to the same position still drops readyState while it
// resettles, and by then the take is the one actually on screen.
function reanchorTakes() {
  onVideos.forEach((v) => {
    if (v.readyState >= 2 && v.currentTime > 0.01) v.currentTime = 0;
    v.play().catch(() => {});
  });
}

function keepTakesOnTheAudioLoop() {
  let lastPhase = 0;

  setInterval(() => {
    if (!loopsRunning || !loopDuration) return;

    const elapsed = audioCtx.currentTime - loopStartedAt;
    if (elapsed < 0) return;

    const phase = elapsed % loopDuration;
    if (phase < lastPhase) reanchorTakes();
    lastPhase = phase;
  }, 20);

  onVideos.forEach((v) => {
    v.addEventListener("ended", () => {
      v.currentTime = 0;
      v.play().catch(() => {});
    });
  });
}

// Opens the session. Every video starts looping here — the idle takes
// visibly, the performance takes behind them at opacity 0 — so that by the
// time a channel is brought in there is a warm, decoding pipeline to seek
// rather than a cold one to start. The audio context is unlocked here too,
// on a real user gesture, so the song can begin the instant it's wanted.
async function startSession() {
  if (started) return;
  started = true;

  try {
    await audioCtx.resume();
    videos.forEach((v) => {
      if (v.currentTime > 0.001) v.currentTime = 0;
      v.play().catch(() => {});
    });
    startOverlay.classList.add("hidden");

    // Not awaited: the room tone isn't on the critical path the way the
    // four channels are, so it starts whenever its own decode finishes
    // rather than holding up the video-visible moment above. That decode
    // is usually well under way by the time Start is even clicked, but a
    // channel could in principle be brought in before it resolves — so
    // this only opens at the resting level if the mix is still empty by
    // then; otherwise it leaves the gain at 0, exactly where setTileState
    // will already have ramped it.
    if (ambientBufferPromise) {
      ambientBufferPromise.then((buffer) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(ambientGain);
        source.start();
        if (!active.some(Boolean)) {
          ambientGain.gain.setValueAtTime(AMBIENT_LEVEL, audioCtx.currentTime);
        }
      }).catch(() => {});
    }
  } catch (err) {
    started = false;
    console.error("Failed to start session", err);
    startBtn.textContent = "[ Retry — Playback Failed ]";
  }
}

startBtn.addEventListener("click", startSession);

screens.forEach((screen) => {
  const index = Number(screen.dataset.index);
  screen.addEventListener("click", () => {
    if (!started) startSession();
    const next = !active[index];

    // On the very first activation, beginLoops() won't reach its own
    // reanchor until START_LOOKAHEAD out — which lands mid-crossfade, right
    // as this tile's take is fading into view. Seeking a take, even to 0,
    // briefly drops its readyState while the seek settles, and that's what
    // was showing through as a black flash. Doing that seek right now
    // instead, before the crossfade below has even started, keeps it well
    // clear of the reveal; pausing afterward holds the take on that frame
    // rather than letting it run ahead of the audio's own lookahead, and
    // reanchorTakes() resumes it exactly when playback is meant to begin.
    if (next && !loopsRunning) {
      const take = onVideos[index];
      if (take.readyState >= 2) take.currentTime = 0;
      take.pause();
    }

    if (next) beginLoops();
    setTileState(index, next);
  });
});

// Chromium can't style the filled part of a range on its own, so the track
// is painted from a gradient that reads this.
function paintFader(fader) {
  fader.style.setProperty("--fill", `${Number(fader.value) * 100}%`);
}

faders.forEach((fader) => {
  const index = Number(fader.dataset.index);
  paintFader(fader);

  fader.addEventListener("input", () => {
    levels[index] = Number(fader.value);
    paintFader(fader);
    // Follow the finger closely while dragging — a 30ms ramp per input event
    // would lag audibly behind a fast move — but still ramp rather than jump,
    // so a drag doesn't crackle.
    applyLevel(index, 0.012);
  });

  // The fader sits on top of its tile, so keep taps and drags on it from
  // reaching the tile underneath and toggling the channel.
  ["pointerdown", "click"].forEach((type) =>
    fader.addEventListener(type, (e) => e.stopPropagation())
  );
});
