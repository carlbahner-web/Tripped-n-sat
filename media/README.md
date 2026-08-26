# Media files

Drop your loops in here using these exact filenames:

| Slot | Audio | Video |
|------|-------------|-------------|
| 1 | `loop1.mp3` | `loop1.mp4` |
| 2 | `loop2.mp3` | `loop2.mp4` |
| 3 | `loop3.mp3` | `loop3.mp4` |
| 4 | `loop4.mp3` | `loop4.mp4` |

For the four loops to stay in sync indefinitely, each audio/video pair
should be the **same duration**, and ideally all four pairs share the
same duration too (so they all wrap back to the start at the same
moment). Slightly mismatched lengths will still play, but the
periodic drift-correction in `app.js` will skip re-syncing any pair
whose durations differ by more than 0.3s.
