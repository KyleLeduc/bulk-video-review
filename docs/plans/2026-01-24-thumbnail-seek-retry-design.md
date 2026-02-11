# Thumbnail Seek Retry Design

## Context
Thumbnail generation seeks through an in-memory video element to capture frames.
Some videos intermittently fail to seek, causing timeouts and partial thumbnail
sets. Debug logs were added to trace this, but they are now too noisy.

## Problem
Seek operations can hang or hit decode errors at specific timestamps. Current
behavior times out quickly and returns partial thumbnail lists, which masks
failure and leaves inconsistent UI state.

## Goals
- Retry seeks with increasing timeouts before failing.
- When thumbnail generation fails partway, return no thumbnails and log once.
- Keep logging minimal and targeted to failures.

## Non-Goals
- Rewriting the video pipeline or switching thumbnail strategies.
- Persisting blob URLs or changing session registry behavior.

## Design
- Add retry/backoff to `seekToTime` with default timeouts of 1s, 2s, 4s.
- Each attempt listens for `seeked` and terminal events (`error`, `stalled`,
  `abort`) and uses a timeout guard.
- On final failure, raise an error that includes the last attempt context.
- `generateThumbnails` aborts on the first seek failure and returns `[]`,
  logging a single warning with timing context.
- Remove temporary debug logging added during diagnosis in ingestion and parser
  paths.

## Testing
- Unit test: seek retries succeed when `seeked` arrives after the first timeout.
- Unit test: thumbnail generation returns `[]` when a later seek fails after
  earlier successes.

## Risks
- Longer timeouts increase wait time for failures; retry count is capped.
- Some media decode failures may still repeat across retries; these will surface
  via the single failure log.
