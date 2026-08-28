# Media files

Real content from Pari/Jason's "Runaway" session, 125 BPM.

| Channel | Accent | Audio | On (playing) | Off (idle) |
|---------|--------|-------|--------------|------------|
| Drums   | orange | `drums.mp3` (15.36s) | `drums-on.webm`/`.mp4` | `drums-off.webm`/`.mp4` |
| Guitars | gold   | `guitars.mp3` (15.36s) | `guitars-on.webm`/`.mp4` | `guitars-off.webm`/`.mp4` |
| Bass    | purple | `bass.mp3` (15.36s) | `bass-on.webm`/`.mp4` | `bass-off.webm`/`.mp4` |
| Synths  | maroon | `synths.mp3` (15.36s) | `synths-on.webm`/`.mp4` | `synths-off.webm`/`.mp4` |

`bg-loop.webm`/`.mp4` is a psychedelic backdrop shown full-bleed behind
the page — the same "whole band" payoff as the glow around the tiles,
just staged behind them instead of on them. It fades in only while all
four channels are active at once and runs on its own clock (it is not
part of the phase-locked audio mix, so it just plays/pauses rather than
seeking or restarting). Downscaled from the supplied 1280x720 source to
960x540 and re-encoded without audio (`-an`) as VP9/`.webm` and
H.264/`.mp4`, same as the performance takes.

`ambient.mp3` is a quiet room-tone loop, the mirror image of the
psychedelic backdrop: it plays while the stage is empty and fades out
the moment any channel is brought in, fading back in the moment the
mix drops back to nothing. It runs through its own `GainNode`
(`AMBIENT_LEVEL` in `app.js`, currently 0.35) on its own independent
loop, not the phase-locked mix, so bringing channels in and out never
touches it beyond that one gain ramp.

`gradient-source.jpg` is the supplied background artwork. It is kept
for reference only — nothing loads it. The page draws the background
as a CSS gradient in `style.css` instead, which measures within ~1% of
the source per channel and, unlike the JPEG, rescales to any viewport
and rotates for portrait without resampling or banding. Re-derive the
stops from this file if the artwork ever changes.

All four audio loops were exported as 48kHz/24-bit WAV, exactly
**15.36s** each, converted to MP3 (V2 VBR). `decodeAudioData` (the
Web Audio path used for playback) confirms all four decode to the
exact same sample length (677,375 samples @ 44.1kHz) — required for
the phase-lock described below.

Each channel has two videos instead of one, sourced from separate
"Played"/"Bored" takes filmed for this purpose — toggling a channel
swaps which video is visible (a quick opacity crossfade) rather than
dimming a single video. The idle ("off") take loops continuously and
independently from Start via its own `loop` attribute; the performance
("on") take does not — see "How the video stays in sync" below for why.
Toggling never restarts either one. Source `.mov` files (1280x720) were
downscaled to 640x360
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

## How the video stays in sync

The idle take can just loop natively — nobody is watching it against a
beat. The performance ("on") take can't: Chromium's native `loop`
restarts a take up to ~95ms before the duration it actually reports, on
its own internal heuristic with no idea where the audio is, and that
was visible as the picture running ahead of the beat. So the `loop`
attribute is dropped from the on-video markup entirely, and `app.js`
(`keepTakesOnTheAudioLoop`) re-anchors every performance take to frame
0 itself, on the instant the audio loop turns over — the one seek this
single-keyframe format is cheap at (~10ms; a non-zero seek can run
seconds). A performance take now only ever restarts on that signal, so
it can no longer drift ahead on its own.

## Filenames

Drop replacement loops in here using these exact filenames:
`{drums,guitars,bass,synths}.mp3`,
`{drums,guitars,bass,synths}-{on,off}.webm/.mp4`. For the audio to
stay phase-locked, all four `.mp3` files need the exact same duration.
