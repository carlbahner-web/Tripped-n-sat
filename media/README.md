# Media files

Drop your loops in here using these exact filenames:

| Slot | Tile label | Audio | Video | Source stem |
|------|------------|-------------|-------------|-------------|
| 1 | Drums    | `loop1.mp3` ✅ | `loop1.mp4` (pending) | `1 - Drums - SC_MBB_100_drum_loop_emotion_more_kicks.wav` |
| 2 | Vinyl Cut| `loop2.mp3` ✅ | `loop2.mp4` (pending) | `2 - Others - FF_100_vinyl_cut_loop_boogie_Fmaj.wav` |
| 3 | Organ    | `loop3.mp3` ✅ | `loop3.mp4` (pending) | `3 - Keys - SC_DO_110_organ_riff_m_three_lick_blue_Fmin.wav` |
| 4 | Pandeiro | `loop4.mp3` ✅ | `loop4.mp4` (pending) | `4 - Drums - RARE_TP4_100_Percussion_Pandeiro_loop_play.wav` |

All four stems are from "original reels 2" at 100 BPM, converted from the
original WAVs to MP3 (V2 VBR). Each is exactly **19.2s**, and Chromium
reports that exact duration back for all four (LAME encoder padding is
trimmed correctly), so they stay phase-locked with the app's drift
correction. Video files for each slot are still needed — once they're
added, verify each video's duration also matches 19.2s.

For the four loops to stay in sync indefinitely, each audio/video pair
should be the **same duration**, and ideally all four pairs share the
same duration too (so they all wrap back to the start at the same
moment). Slightly mismatched lengths will still play, but the
periodic drift-correction in `app.js` will skip re-syncing any pair
whose durations differ by more than 0.3s.
