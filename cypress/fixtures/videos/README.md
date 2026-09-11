# Browser smoke fixtures

These original, silent synthetic clips are generated entirely from FFmpeg's
`color` source; they contain no third-party footage, audio, fonts, or artwork.
They are dedicated to the public domain under CC0-1.0. They exercise real browser
metadata, seeking, JPEG thumbnails, and H.264 playback, not realistic performance.

Both are 160×90, 2 fps, H.264/yuv420p MP4 with a front-loaded index. Generate with
FFmpeg (the qualification run used Cypress 16's bundled FFmpeg
`N-47683-g0e8eb07980-static`); do not overwrite an existing fixture accidentally:

```sh
ffmpeg -n -f lavfi -i color=c=blue:s=160x90:r=2 -t 4 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart cypress/fixtures/videos/short-blue.mp4
ffmpeg -n -f lavfi -i color=c=red:s=160x90:r=2 -t 65 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart cypress/fixtures/videos/long-red.mp4
```

The duration difference exercises minute-based range filters. An invalid MP4
used in the test is a short in-memory text buffer, not a downloaded corrupt file.
Use a separate representative corpus for performance measurements.

## Approximate timeline regressions

`boundary-long-blue.mp4` and `boundary-short-blue.mp4` are also original CC0
FFmpeg color sources, with a generated silent AAC track. Both are 160×90,
20 FPS, H.264/yuv420p. Their video starts at 0.05 seconds; the silent audio
extends beyond the video. The pinned Mediabunny 1.55.7 metadata probe reports:

| Fixture | Video start | Video end | Whole input end |
| --- | ---: | ---: | ---: |
| boundary-long-blue | 0.05 | 65.05 | 65.2 |
| boundary-short-blue | 0.05 | 0.85 | 1.0 |

These exercise complete motion/seek output, nonblank first samples, and shorter
clip output without claiming exact requested-frame selection. Reproduce with
the same bundled FFmpeg noted above (do not overwrite existing fixtures):

```sh
ffmpeg -n -f lavfi -i color=c=blue:s=160x90:r=20:d=65 -f lavfi -i anullsrc=r=48000:cl=mono -filter:v setpts=PTS+0.05/TB -t 65.2 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart cypress/fixtures/videos/boundary-long-blue.mp4
ffmpeg -n -f lavfi -i color=c=blue:s=160x90:r=20:d=0.8 -f lavfi -i anullsrc=r=48000:cl=mono -filter:v setpts=PTS+0.05/TB -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart cypress/fixtures/videos/boundary-short-blue.mp4
```
