const offVideos = Array.from(document.querySelectorAll(".off-video"));
const onVideos = Array.from(document.querySelectorAll(".on-video"));
const videos = [...offVideos, ...onVideos];
const audios = Array.from(document.querySelectorAll(".loop-audio"));
const screens = Array.from(document.querySelectorAll(".screen"));
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");
const jumpscareCat = document.getElementById("jumpscare-cat");

const active = [false, false, false, false];
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

function setTileState(index, isActive) {
  active[index] = isActive;
  screens[index].classList.toggle("active", isActive);
  screens[index].setAttribute("aria-pressed", String(isActive));

  // Ramped rather than switched, to avoid a click. On the very first
  // activation this runs before the song has actually started, which is
  // what we want: the gain is already at 1 by the time the first sample
  // plays, so the loop opens at full volume instead of fading up into it.
  const g = gains[index].gain;
  const now = audioCtx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(isActive ? 1 : 0, now + 0.03);

  jumpscareCat.classList.toggle("active", active.every(Boolean));
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
    // lookahead, leaving video visibly ahead of the beat.
    // The performance takes have been rolling invisibly since Start, so all
    // that happens here is a seek back to their first frame — they restart
    // from the top alongside the audio. They are deliberately not started
    // from a standstill at this moment: calling play() on four idle videos
    // at once took over a second to produce a frame, which would have left
    // the picture trailing the downbeat. Seeking four already-running ones
    // takes about 20ms and never drops readyState.
    setTimeout(() => {
      onVideos.forEach((v) => { v.currentTime = 0; });
      keepTakesOnTheAudioLoop();
    }, START_LOOKAHEAD * 1000);
  } catch (err) {
    loopsRunning = false;
    console.error("Failed to start the loops", err);
  }
}

// Left to their own `loop` attribute the takes wander off the beat — measured
// at roughly 95ms per pass, and they never come back, so after a few minutes
// the picture has nothing to do with what you're hearing. Two obvious fixes
// both fail here:
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
// What is cheap is seeking to zero. So the takes are re-anchored there each
// time the audio loop turns over, which is both the one seek the format is
// fast at and the moment a small discontinuity is least visible. Drift can no
// longer accumulate: it resets every pass instead of compounding.
function keepTakesOnTheAudioLoop() {
  let lastPhase = 0;

  setInterval(() => {
    if (!loopsRunning || !loopDuration) return;

    const elapsed = audioCtx.currentTime - loopStartedAt;
    if (elapsed < 0) return;

    const phase = elapsed % loopDuration;
    if (phase < lastPhase) {
      onVideos.forEach((v) => {
        if (v.readyState >= 2) v.currentTime = 0;
      });
    }
    lastPhase = phase;
  }, 100);
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
    if (next) beginLoops();
    setTileState(index, next);
  });
});
