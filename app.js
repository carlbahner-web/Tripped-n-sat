const videos = Array.from(document.querySelectorAll(".loop-video"));
const audios = Array.from(document.querySelectorAll(".loop-audio"));
const tiles = Array.from(document.querySelectorAll(".tile"));
const toggleBtns = Array.from(document.querySelectorAll(".toggle-btn"));
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

const active = [false, false, false, false];
let started = false;

// Videos never carry sound of their own — the paired <audio> element is the
// only audio source, so video stays muted permanently and only its
// visibility toggles.
videos.forEach((v) => { v.muted = true; });
audios.forEach((a) => { a.muted = true; });

function setTileState(index, isActive) {
  active[index] = isActive;
  tiles[index].classList.toggle("active", isActive);
  audios[index].muted = !isActive;
}

function startSession() {
  if (started) return;
  started = true;

  const master = audios[0];

  const playAll = [...videos, ...audios].map((el) => {
    el.currentTime = 0;
    return el.play().catch((err) => console.warn("play() blocked for", el.src, err));
  });

  Promise.all(playAll).then(() => {
    startOverlay.classList.add("hidden");
  });

  // Loops can drift apart over long sessions (independent decode timers);
  // periodically re-align every media element to the first audio track,
  // but only when its duration roughly matches (otherwise a seek would
  // just fight a loop of a different length).
  setInterval(() => {
    if (master.paused) return;
    const t = master.currentTime;
    [...videos, ...audios].forEach((el) => {
      if (el === master || el.paused) return;
      if (Math.abs(el.duration - master.duration) > 0.3) return;
      if (Math.abs(el.currentTime - t) > 0.15) {
        el.currentTime = t;
      }
    });
  }, 3000);
}

startBtn.addEventListener("click", startSession);

toggleBtns.forEach((btn) => {
  const index = Number(btn.dataset.index);
  btn.addEventListener("click", () => {
    if (!started) startSession();
    setTileState(index, !active[index]);
  });
});
