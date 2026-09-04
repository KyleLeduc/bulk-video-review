# Ingestion and Preview Pipeline Design

## Objective

Prevent repeated video imports from making the browser tab unresponsive, make
preview generation observable and cancellable, and reuse the generated frames
for animated cards and timeline hover previews.

The implementation remains browser-local and keeps the deployed server
stateless. It does not add FFmpeg, WebCodecs, a backend media service, or a new
runtime dependency.

## Chosen approach

The current pipeline creates source-resolution canvases and synchronously
encodes them as base64 data URLs. Several Promise jobs can perform that work in
the same window at once. The new pipeline instead captures a maximum-width
480-pixel frame, encodes it asynchronously with `canvas.toBlob`, and persists
timeline frames as `Blob` values in a dedicated IndexedDB object store.

Automatic preview concurrency is one. An explicit diagnostics override may use
two jobs for comparison, but the application no longer derives media pressure
from `navigator.hardwareConcurrency`. Promise concurrency is not treated as
worker isolation.

FFmpeg.wasm and Mediabunny/WebCodecs remain benchmark candidates. They should
only replace this path after the existing video-engine lab demonstrates a
measurable benefit on representative files and the deployment has the secure
context and isolation headers their advanced modes require.

## Data model and persistence

`VideoEntity` keeps `thumb` and `thumbUrls` so existing IndexedDB records remain
readable. New timeline previews use a runtime `VideoPreviewFrame` model:

```ts
interface VideoPreviewFrame {
  timestampSeconds: number
  blob: Blob
  width: number
  height: number
}
```

`ParsedVideo` gains `previewFrames`, while the persisted aggregate remains
small. Database version 4 creates a `VideoPreviewFrames` object store keyed by
`videoId`. Each record contains the ordered frame array for one video. Replacing
previews therefore clones only preview data, rather than rewriting metadata,
votes, tags, and legacy base64 strings with every update.

The v4 migration creates the store without eagerly translating old data.
Existing `thumb` and `thumbUrls` values remain a rendering fallback. Newly
generated previews use the Blob store and clear legacy timeline data only after
the Blob record has been persisted successfully. This avoids a long, failure-
prone database-upgrade conversion and preserves user data.

Presentation components create short-lived object URLs from the in-memory
Blobs. `VideoCard` owns and revokes those URLs when frames change or the card is
unmounted. The video session registry continues to own only source-video URLs.

## Ingestion and generation flow

Metadata ingestion remains linear. Its one cover capture is resized and
asynchronously encoded before being converted to a small persisted data URL for
backward-compatible cover rendering.

After ingestion completes, the preview scheduler queues timeline generation:

1. Acquire the source video URL from the session registry.
2. Load one hidden video element with an abort signal and timeout.
3. Seek to evenly distributed timestamps.
4. Draw each frame into a bounded canvas and encode a JPEG Blob asynchronously.
5. Persist the ordered frame set in `VideoPreviewFrames`.
6. Publish the existing thumbnail-updated event and merge the frames into the
   current Pinia video snapshot.
7. Always pause and unload the hidden video and release its source URL.

If a new ingestion request arrives, active background preview controllers are
aborted. Aborted jobs return to the background queue rather than being marked
failed. Once the current bounded encode unwinds, ingestion starts; previews
resume only after the ingestion queue drains. Removing a video also aborts and
settles its queued or active work.

## Errors and diagnostics

Media load, seek, capture, encode, and persistence failures use `Error` objects
with useful context instead of rejecting `null`. Abort is represented by an
`AbortError` and is not counted as a preview failure.

The store tracks the latest diagnostic record per video: stage, start and end
times, elapsed time, completed/total frames, output bytes, dimensions, and an
error message when relevant. The diagnostics panel shows the active/recent job
and makes clear that automatic concurrency is the safe single-job budget.

## Card and player behavior

`VideoCard` binds its image source reactively. It animates the ordered Blob
preview URLs on hover, retains the existing warm-up delay when previews are
missing, resets cleanly on leave or video playback, and disables automatic
animation for `prefers-reduced-motion` users. Legacy `thumbUrls` still work as
a fallback.

`VideoEmbed` keeps native controls as the supported playback fallback. A small
custom range rail sits adjacent to the native video because browser-owned
native progress controls cannot be extended portably. Pointer or keyboard
movement selects the nearest already-generated preview without decoding or
seeking during hover. Deliberate range input seeks the video. The tooltip shows
one image and timestamp, hides on leave/blur, and clamps safely for missing or
invalid duration data.

On unmount, the player clears handlers, pauses, removes its `src`, calls
`load()`, and then releases the session URL.

## Verification strategy

Unit tests cover scaled async capture, abort cleanup, Blob repository behavior,
database migration, use-case persistence, scheduler cancellation/requeue,
diagnostic state, card URL lifecycle, reduced motion, timeline lookup/seeking,
and source-video cleanup. Full lint, type-check, unit test, and production build
commands run before handoff.

A real-browser performance profile with representative 4K/problem files remains
an acceptance gate for claiming that the original tab freeze is eliminated.
The automated suite proves bounded behavior and lifecycle rules but cannot
measure decoder memory or browser long tasks.
