# Media files

| Slot | Tile label | Audio | Video (webm + mp4 fallback) | Source |
|------|------------|-------------|-------------|-------------|
| 1 | Drums    | `loop1.mp3` (19.2s) | `loop1.webm` / `loop1.mp4` (2.35s, drumming kitten) | `1 - Drums - SC_MBB_100_drum_loop_emotion_more_kicks.wav` |
| 2 | Vinyl Cut| `loop2.mp3` (19.2s) | `loop2.webm` / `loop2.mp4` (3.72s, guitar cat) | `2 - Others - FF_100_vinyl_cut_loop_boogie_Fmaj.wav` |
| 3 | Organ    | `loop3.mp3` (19.2s) | `loop3.webm` / `loop3.mp4` (1.0s, keyboard cat) | `3 - Keys - SC_DO_110_organ_riff_m_three_lick_blue_Fmin.wav` |
| 4 | Pandeiro | `loop4.mp3` (19.2s) | `loop4.webm` / `loop4.mp4` (0.7s, tambourine cat) | `4 - Drums - RARE_TP4_100_Percussion_Pandeiro_loop_play.wav` |

All four audio stems are from "original reels 2" at 100 BPM, converted
from the original WAVs to MP3 (V2 VBR). Each reports exactly **19.2s**
in-browser.

## How the audio stays in sync

`app.js` plays the four audio loops through the Web Audio API, not
through the `<audio>` tags directly (those tags just hold the file
paths). On Start, all four are decoded into buffers and each is
scheduled with `AudioBufferSourceNode.start(sameTimestamp)` — Web
Audio scheduling is sample-accurate, and each buffer's loop point is
defined against that same audio clock, so all four stay phase-locked
indefinitely with no runtime correction needed. Toggling a channel
only ramps its `GainNode` between 0 and 1 (a 30ms fade, to avoid a
click) — the underlying source node is never paused or restarted.

This is a hard requirement, not just a nice-to-have: an
HTMLMediaElement's native `.play()`/`loop` gives no guarantee that
independent elements start or loop in sample-accurate phase with each
other, which is why the original `.play()`-based approach drifted.

Because playback goes through Web Audio, the page must be served over
`http://` or `https://` (e.g. `python3 -m http.server`) — `fetch()`
can't read local files under a `file://` origin in most browsers.

The four videos are short (sub-4s) looping character clips, much
shorter than the audio loops — that's intentional, and independent of
the sync above. They just loop freely via the native `loop` attribute
while their paired audio track keeps its own 19.2s cycle. Each video
is provided as both `.webm` (VP9, smaller, used by Chromium/Firefox)
and `.mp4` (H.264, fallback for Safari) via `<source>` elements in
`index.html` — browsers pick whichever they support.

## Filenames

Drop replacement loops in here using these exact filenames:
`loop{1-4}.mp3`, `loop{1-4}.webm`, `loop{1-4}.mp4`.
