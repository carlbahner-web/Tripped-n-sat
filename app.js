const videos = Array.from(document.querySelectorAll(".loop-video"));
const audios = Array.from(document.querySelectorAll(".loop-audio"));
const screens = Array.from(document.querySelectorAll(".screen"));
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");
const jumpscareCat = document.getElementById("jumpscare-cat");

const active = [false, false, false, false];
let started = false;

// How far into the future audio playback is scheduled (seconds). Web Audio
// needs a small lookahead so all four source.start() calls land before the
// scheduled instant even if the main thread stalls; video playback is
// deliberately delayed by the same amount (see startSession) so it doesn't
// start visibly ahead of the audio it's paired with.
const START_LOOKAHEAD = 0.2;

// Videos are visual only — the audio for each channel is played through
// Web Audio (below), never through the <audio> tags themselves, so video
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

// Decoding doesn't require a user gesture (only starting playback does), so
// kick it off immediately at load time — by the time Start is clicked the
// buffers are usually already decoded and playback begins with no delay.
const bufferPromises = audios.map((a) =>
  fetch(a.currentSrc || a.src)
    .then((res) => res.arrayBuffer())
    .then((buf) => audioCtx.decodeAudioData(buf))
);

function setTileState(index, isActive) {
  active[index] = isActive;
  screens[index].classList.toggle("active", isActive);
  screens[index].setAttribute("aria-pressed", String(isActive));
  const g = gains[index].gain;
  const now = audioCtx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(isActive ? 1 : 0, now + 0.03);

  jumpscareCat.classList.toggle("active", active.every(Boolean));
}

async function startSession() {
  if (started) return;
  started = true;

  try {
    await audioCtx.resume();
    const buffers = await Promise.all(bufferPromises);

    // Every loop is scheduled to begin at the exact same audio-clock
    // instant. Web Audio scheduling is sample-accurate, and each loop's end
    // point is defined against that same clock, so all four stay
    // phase-locked forever — no periodic re-sync needed, unlike
    // HTMLMediaElement playback/looping, which gives no such guarantee.
    const startAt = audioCtx.currentTime + START_LOOKAHEAD;
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
    setTimeout(() => {
      videos.forEach((v) => {
        v.currentTime = 0;
        v.play().catch(() => {});
      });
      startOverlay.classList.add("hidden");
    }, START_LOOKAHEAD * 1000);
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
    setTileState(index, !active[index]);
  });
});
