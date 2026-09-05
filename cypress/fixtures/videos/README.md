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
