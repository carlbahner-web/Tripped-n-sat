# Media files

| Slot | Tile label | Audio | Video (webm + mp4 fallback) | Source |
|------|------------|-------------|-------------|-------------|
| 1 | Drums    | `loop1.mp3` (19.2s) | `loop1.webm` / `loop1.mp4` (2.35s, drumming kitten) | `1 - Drums - SC_MBB_100_drum_loop_emotion_more_kicks.wav` |
| 2 | Vinyl Cut| `loop2.mp3` (19.2s) | `loop2.webm` / `loop2.mp4` (3.72s, guitar cat) | `2 - Others - FF_100_vinyl_cut_loop_boogie_Fmaj.wav` |
| 3 | Organ    | `loop3.mp3` (19.2s) | `loop3.webm` / `loop3.mp4` (1.0s, keyboard cat) | `3 - Keys - SC_DO_110_organ_riff_m_three_lick_blue_Fmin.wav` |
| 4 | Pandeiro | `loop4.mp3` (19.2s) | `loop4.webm` / `loop4.mp4` (0.7s, tambourine cat) | `4 - Drums - RARE_TP4_100_Percussion_Pandeiro_loop_play.wav` |

All four audio stems are from "original reels 2" at 100 BPM, converted
from the original WAVs to MP3 (V2 VBR). Each reports exactly **19.2s**
in-browser, so they stay phase-locked with each other under the app's
drift correction.

The four videos are short (sub-4s) looping character clips, much
shorter than the audio loops — that's intentional. `app.js` only
drift-corrects a video/audio pair when their durations are within
0.3s of each other, so these just loop freely and independently via
the native `loop` attribute while their paired audio track keeps its
own 19.2s cycle. Each video is provided as both `.webm` (VP9, smaller,
used by Chromium/Firefox) and `.mp4` (H.264, fallback for Safari) via
`<source>` elements in `index.html` — browsers pick whichever they
support.

## Filenames

Drop replacement loops in here using these exact filenames:
`loop{1-4}.mp3`, `loop{1-4}.webm`, `loop{1-4}.mp4`. For an audio/video
pair to stay perfectly synced for its whole runtime, keep them the
same duration; the periodic drift-correction in `app.js` skips any
pair whose durations differ by more than 0.3s.
