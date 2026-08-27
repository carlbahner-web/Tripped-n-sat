# Media files

Real content from Pari/Jason's "Runaway" session, 125 BPM.

| Channel | Accent | Audio | On (playing) | Off (idle) |
|---------|--------|-------|--------------|------------|
| Drums   | orange | `drums.mp3` (15.36s) | `drums-on.webm`/`.mp4` | `drums-off.webm`/`.mp4` |
| Guitars | gold   | `guitars.mp3` (15.36s) | `guitars-on.webm`/`.mp4` | `guitars-off.webm`/`.mp4` |
| Bass    | purple | `bass.mp3` (15.36s) | `bass-on.webm`/`.mp4` | `bass-off.webm`/`.mp4` |
| Synths  | maroon | `synths.mp3` (15.36s) | `synths-on.webm`/`.mp4` | `synths-off.webm`/`.mp4` |

All four audio loops were exported as 48kHz/24-bit WAV, exactly
**15.36s** each, converted to MP3 (V2 VBR). `decodeAudioData` (the
Web Audio path used for playback) confirms all four decode to the
exact same sample length (677,375 samples @ 44.1kHz) — required for
the phase-lock described below.

Each channel has two videos instead of one, sourced from separate
"Played"/"Bored" takes filmed for this purpose — toggling a channel
swaps which video is visible (a quick opacity crossfade) rather than
dimming a single video. Both videos in a pair loop continuously and
independently from Start, same as the audio; toggling never restarts
either one. Source `.mov` files (1280x720) were downscaled to 640x360
and re-encoded without audio (the audio track lives only in the
dedicated `.mp3` — see below) as both `.webm` (VP9) and `.mp4` (H.264)
for browser compatibility.

## Why the video's own audio track is unused

The "on" videos were filmed with audio, but playback always goes
through the dedicated WAV/MP3 exports instead, for two reasons: our
sync approach (below) requires audio to route through the Web Audio
API, and `<video>` stays muted permanently regardless of source; and a
dedicated loop export is a more reliable, precisely-trimmed loop point
than audio baked into a video container.

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
other, which is why an earlier `.play()`-based approach drifted.

Because playback goes through Web Audio, the page must be served over
`http://` or `https://` (e.g. `python3 -m http.server`) — `fetch()`
can't read local files under a `file://` origin in most browsers.

## Filenames

Drop replacement loops in here using these exact filenames:
`{drums,guitars,bass,synths}.mp3`,
`{drums,guitars,bass,synths}-{on,off}.webm/.mp4`. For the audio to
stay phase-locked, all four `.mp3` files need the exact same duration.
