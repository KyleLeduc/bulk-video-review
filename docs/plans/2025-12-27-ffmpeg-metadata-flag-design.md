# FFmpeg Metadata Feature Flag Design

## Context
Introduce an FFmpeg wasm-based metadata extractor behind a feature flag so we can validate stability before full rollout. The existing extractor stack already exposes a clean port and parser seam. We will keep the current metadata shape (duration + thumbnail + title) and avoid any schema changes for now.

## Goals
- Add a Diagnostics Panel toggle to switch between DOM parsing and FFmpeg parsing.
- Persist the toggle across reloads using localStorage.
- Keep extraction behavior compatible with the current UI and playback requirements.

## Non-Goals
- No new metadata fields (codec/bitrate/dimensions) yet.
- No FFmpeg-based transcoding or blob persistence.
- No fallback chain or multi-parser registry beyond the boolean selector.

## Architecture
- Keep `IVideoMetadataExtractor` and `IVideoFileParser` unchanged.
- Use `VideoFileParserSelector` as the router with a `shouldUseFfmpeg` callback.
- Add a small feature-flag helper (or equivalent logic in DI) that reads and writes
  `feature.useFfmpegParser` from localStorage.
- Add a persisted `useFfmpegParser` flag to `appStateStore` and bind it to a
  Diagnostics Panel checkbox.
- Ensure both DOM and FFmpeg parsers only attempt files that can be played in the
  browser (shared MIME/canPlayType check). Unsupported types return `null`.

## Data Flow
1. User toggles the "Use ffmpeg metadata extractor" checkbox.
2. Store writes the updated flag to localStorage and reflects it in UI state.
3. `VideoFileParserSelector` reads the current flag for each extraction and routes
   to either `VideoFileParser` or `FfmpegVideoFileParser`.
4. `AddVideosFromFilesUseCase` continues to treat `null` as "skip file".

## Error Handling
- Parser errors are caught in `VideoMetadataExtractorAdapter` and logged.
- Any extraction failure returns `null` so the pipeline can continue.
- Object URLs are still revoked in the use case as today.

## Testing
- Unit test `appStateStore` persistence: flag saved to localStorage and restored.
- Unit test `VideoFileParserSelector` routing based on the flag.
- Optional component test to verify Diagnostics Panel toggles state correctly.

## Rollout
- Default flag to `false`.
- Enable flag via Diagnostics Panel for manual testing.
- Once stable, update the default to `true` and remove the toggle.
