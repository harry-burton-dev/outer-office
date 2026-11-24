# Anime.js on OO2's real screens (OUT-90 spike)

Not part of the app bundle. `entry.tsx` renders the real app frame on a synthetic
diary (seeded through the real commands) and adds four Anime.js cues on its DOM:
drag to propose, updates arriving on Home, the Live/Proposed layer switch, and a
rolling count. `capture.js` builds it, plays each cue in headless Chromium at
normal and reduced motion, and writes GIFs, exact frame strips (seeked
timelines) and rAF frame timings (normal and 4x-slowed CPU).

    node app/src/app/spike/anime/capture.js <out-dir> [drag,arrive,layer,count] [normal]

Needs ffmpeg and ImageMagick. Findings and the comparison with Motion and
Animate UI are in the OO2 epic notes (anime-js-on-oo2.md). `shots/` holds the
strips and timings from the run those notes describe.
