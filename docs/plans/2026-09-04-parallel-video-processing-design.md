# Parallel video processing design

**Status:** Proposed; planning only. Chrome/Edge-first priority is confirmed. Backend choice, initial budgets, performance targets, and any new demuxing dependency require validation during implementation.

**Baseline:** `master` at `7c6be95`, 2026-09-04. Builds on the [ingestion/preview design](2026-08-22-ingestion-preview-pipeline-design.md) and [foreground concurrency design](2026-08-22-primary-ingestion-concurrency-observability-design.md), without replacing their ownership and scheduling guarantees.

## Outcome and scope

Increase batch ingestion and preview throughput while keeping the UI responsive. Chrome and Edge are the first measurement/qualification targets, not a strict browser allowlist; selection uses runtime capability checks, not user-agent strings. Unsupported capabilities/files and explicit opt-out retain the existing path. Other capable browsers may select workers, but are not claimed qualified until measured. This is local browser work: no video uploads, server processing service, transcoding product, or format-support expansion.

Do not implement this plan as part of branch cleanup. Do not change deployment headers, redirect HTTP, migrate storage, install dependencies, or restore the retired FFmpeg/video-lab branches as a shortcut.

## Current implementation and likely costs

| Stage                       | Current implementation                                                                                            | Proposed treatment                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Identity and classification | `FileHashGenerator` hashes **name + size**, not file contents; Web Crypto has a JavaScript fallback               | Preserve IDs exactly; do not add expensive content hashing or a hashing worker                           |
| Metadata and initial cover  | `BrowserVideoFileParser` loads a DOM video, seeks, captures a resized JPEG, returns a data-URL cover              | Instrument first; share worker image encoding initially; evaluate worker demux/decode in the later phase |
| Foreground scheduling       | `LinearVideoIngestionUseCase` and `videosStore`; auto 2, manual 1–4                                               | Keep bounded sessions, duplicate ownership, fresh-before-retry ordering, and incremental publication     |
| Preview generation          | `VideoThumbnailGeneratorAdapter` and `videoDomUtils`; DOM seeking/drawing and canvas encoding; auto 1, manual 1–4 | Move resize/encode to workers first, then seek/decode supported inputs inside workers                    |
| Persistence and display     | Blob `VideoPreviewFrame[]`, IndexedDB v4, session-owned playback URLs                                             | Keep existing contracts initially and persistence on the coordinator; no schema or origin migration      |

Promises and current concurrency limits already overlap asynchronous jobs. They do not relocate application JavaScript or DOM work into worker threads. Native media operations may already use browser-managed threads: improved responsiveness is plausible, but throughput must be measured rather than inferred from worker count.

## Alternatives

1. **Raise existing job limits.** Lowest implementation cost, but increases overlapping DOM/media activity and may worsen memory pressure or UI stalls. Retain for controlled benchmarks, not as the proposed solution.
2. **Bounded module workers + OffscreenCanvas, followed by WebCodecs where justified — recommended.** Small first increment, per-file fallback, reusable worker execution for cover and preview consumers. Full worker decoding adds container handling and therefore a deliberate dependency/compatibility decision.
3. **Threaded FFmpeg/WASM.** Consider only for measured native-path gaps. The retired prototype lacks safe concurrent runtime ownership, bounded memory/cancellation, and verified production assets. Do not pay those costs merely to get more threads.

## What HTTPS changes

Dedicated workers are a separate mechanism from secure-context-only APIs; a worker is not inherently gated on HTTPS. OffscreenCanvas is exposed in workers, allowing image work without moving DOM elements across threads. [HTML workers](https://html.spec.whatwg.org/multipage/workers.html), [OffscreenCanvas](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface).

`VideoDecoder` is exposed in dedicated workers in secure contexts. Trusted HTTPS enables that prerequisite, but each codec/configuration still needs a capability check and runtime error handling. It does not guarantee hardware acceleration or faster processing. [WebCodecs specification](https://www.w3.org/TR/webcodecs/#videodecoder-interface).

HTTPS alone does **not** establish cross-origin isolation for shared-memory WASM threads. If later justified, separately test `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, resource CORS/CORP compatibility, permissions policy, and `crossOriginIsolated` in both document and worker. Those headers can affect external resources and window interactions. No isolation-header rollout is required for the recommended initial phases. [Chrome team's isolation guidance](https://web.dev/articles/coop-coep).

Keep HTTP available without silently migrating its independent IndexedDB catalog to HTTPS. A header probe is not browser proof: acceptance must record `isSecureContext`, worker capabilities, and codec checks in the actual target browsers.

| Path                                  | Eligibility                                                                                                         | Fallback                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Phase B worker resize/encode          | HTTP or HTTPS; module-worker handshake, bitmap transfer, OffscreenCanvas 2D/JPEG support, and memory admission pass | Existing DOM capture/encoder                                                |
| Phase C worker metadata/decode        | Secure context plus qualified container/codec configuration and bounded resource checks                             | Existing DOM metadata/seek path, optionally using eligible Phase B encoding |
| Session opt-out or unavailable worker | Any browser/origin                                                                                                  | Existing DOM path; no automatic redirect or storage move                    |

The existing preprod HTTPS endpoint responded with trusted HTTP/2 200 during planning on 2026-09-04; COOP/COEP were absent from that response. This confirms transport/header state only, not browser API support.

## Execution and ownership

### Phase A — Measure

Extend existing ingestion/preview diagnostics with queue wait, metadata load, seek/decode, resize/encode, persistence, first-visible-video, total completion time, worker/backend selection, and fallback reason. Record observations per session/job; do not introduce a second telemetry/queue framework or log private filenames/file contents in exported benchmarks by default.

Use a fixed, locally held corpus: short and long videos, high resolution, portrait/rotation, variable frame rate, duplicate files, malformed inputs, and supported/unsupported codecs. Benchmark both cold and warm catalogs without wiping a user's catalog. Record app revision, browser/OS, hardware hint, codec/backend, corpus description, and concurrency settings.

### Phase B — Worker image processing, existing DOM seeking

Create one lazy infrastructure-owned module-worker pool shared by the cover and preview paths. Retain `HTMLVideoElement` loading/seeking on the main thread. After a successful seek, acquire an execution slot before creating/transferring an `ImageBitmap`; the worker resizes and JPEG-encodes using OffscreenCanvas. Preserve current 480 px default width, no upscaling, aspect ratio, JPEG quality 0.72, timestamps, and cover/preview output formats.

Keep at most one outstanding capture per active video job. Before `createImageBitmap`, validate source/destination dimensions and reserve estimated raw bytes from a shared 128 MiB application-owned budget (start conservatively at 8 bytes per source pixel for overlapping capture/transfer storage). Bound destination pixels and encoded output bytes too. Reject oversized captures before allocation and use the existing resized DOM path; wait without holding a bitmap when another job holds the byte budget. Release reservations only when owned resources are closed or their worker is terminated. This is an application allocation estimate, not a bound on native browser decoder/GPU memory. Close image resources on success, abort, errors, and transfer failures. Return Blobs through structured cloning; do not put Blobs/Files in transfer lists. Convert only the initial cover to its existing data-URL representation. Preserve a DOM encoder fallback and surface why it was selected.

Worker APIs belong under `src/infrastructure/video`, not in domain entities, Pinia, or application use cases. Construct/inject shared dependencies in `src/infrastructure/di/container.ts`. A single explicit frame-encoding seam is justified by the two real consumers, not a general-purpose job framework.

### Phase C — Worker-native metadata and frame extraction

WebCodecs consumes encoded chunks, not an MP4/WebM file directly; demuxing remains the application's responsibility. Evaluate a small maintained demuxing library using its current primary documentation, license, supported formats, range/streamed reads, bundle cost, and cancellation behavior. Select one and request approval for the justified new dependency before installation. [W3C WebCodecs explainer](https://github.com/w3c/webcodecs/blob/main/explainer.md#non-goals).

First qualify one common combination, MP4/H.264, then add WebM/VP8/VP9 only with matching fixtures and evidence. Metadata parsing and cover generation run in the same worker job; preview generation reuses the same pool, not nested child pools. Preserve current browser-playability policy. Unsupported tracks, configurations, malformed indexes, or resource limits fall back once to the DOM path.

Pass the original session File via structured cloning, without reading the whole video into an ArrayBuffer. For previews, explicitly extend the thumbnail source contract and session registry read access only at this phase: the adapter receives the original File plus the existing fallback URL. Do not fetch a blob URL into a second full-file buffer or let workers acquire/revoke playback URLs.

Read bounded file ranges, locate a preceding keyframe for each requested timestamp, decode the necessary dependency frames, select by presentation timestamp, and discard/close unneeded frames. Preserve rotation, dimensions, timestamp units, and preview ordering. Long GOPs, unavailable indexes, or unsupported color/rotation handling must hit a bounded fallback, not silently produce incorrect frames. Never decode a multi-hour video in full merely to obtain its previews.

### Shared budget and lifecycle

- Keep one pool per app instance. Proposed auto capacity: `max(1, min(2, floor(hardwareConcurrency / 2)))`, using 2 as the missing/invalid hint. This is a conservative starting policy, not a measured optimum. Hardware concurrency is only a hint. [HTML hardware capabilities](https://html.spec.whatwg.org/multipage/workers.html#navigator.hardwareconcurrency).
- Keep existing per-stage manual 1–4 job controls; do not add a competing slider in the first phase. Effective worker capacity limits execution even if more jobs are requested. Any later capacity tuning stays capped at 4 and goes through measurements.
- Bound queued work, encoded input bytes, held decoded frames, and output bytes independently. Proposed Phase C starting limits: 16 MiB compressed-input window and two application-held decoded frames per worker; 128 MiB app-owned raw-frame budget across the pool. Browser/internal decoder memory is not covered by these estimates and must be observed separately. Oversized input dimensions or inability to bound a demuxer cause fallback.
- Reuse foreground priority: new ingestion cancels previews, waits for their cleanup, then starts. A job holding a pool slot must execute encoding inline within that worker; it must not recursively request another slot and deadlock. Retry work remains behind fresh files.
- Use versioned request IDs and session/generation IDs; every response, progress update, and persistence submission is checked against the active generation. Abort is an explicit message, not an assumed transferable AbortSignal.
- Before Phase B enablement, add the currently missing foreground cancellation contract: carry optional AbortSignal through ingestion options, extractor/parser options and DOM operations; propagate AbortError instead of converting it to parse failure; do not update failure history for cancelled work. New imports still queue behind active foreground imports; only the existing preview interruption policy and explicit disposal/wipe invalidate relevant work.
- The current diagnostics wipe calls the wipe use case directly and does not drain jobs. Route it through the existing store/coordinator: block new work, invalidate generations, abort queued/active foreground and preview jobs, await cleanup **and already-started persistence**, then wipe storage and clear session resources before reopening admission. A transaction already accepted before abort may commit; cancellation does not undo it. Awaiting those writes before the wipe is what prevents post-wipe resurrection. Do not promise that ignoring a late worker message alone protects the database.
- Bound startup and job deadlines. Cancel queued work immediately; request active cancellation, then terminate/recreate only that worker after a proposed 1-second grace period. Retain the slot until cleanup or termination. Catch `error`, `messageerror`, duplicate/late responses, and structured-clone failures.
- Never launch fallback for cancellation. On a recoverable worker failure, release resources before one fallback attempt; disable a repeatedly failing backend for that session rather than restart-looping. No stale result may overwrite a newer import, wipe, or preview generation.
- Keep IndexedDB writes on the current coordinator and preserve transaction-completion semantics, votes/pins, and all-or-nothing preview replacement. No files or workers are persisted. Dispose idle workers on app teardown.

## Acceptance and rollout

Unit tests establish limits, message/cancellation behavior, output semantics, registry ownership, and persistence regressions. Built-browser tests establish real module-worker loading, transfers, OffscreenCanvas, codec configuration, and fallback. Headless tests do not establish native performance or visual correctness.

Proposed release targets, to validate against baseline: at least 20% lower median end-to-end time for the eligible worker-native corpus; no more than 5% regression for fallback imports; and no material interaction regression during import/preview work. Record at least five comparable runs and p95 interaction latency/long-task time; reject noisy or cherry-picked results. Phase B can ship for demonstrated responsiveness gains even if decoding remains the throughput bottleneck, but must report that distinction explicitly.

Use the existing diagnostics panel for backend/capability/fallback visibility and a session-scoped opt-out. Enable each phase only after its correctness and performance evidence. Review the architecture before merging. Deploy through the existing immutable preprod runbook only when separately requested, then test real Chrome and Edge against the built release. Exercise forced/missing-capability DOM fallback in Firefox/Safari; do not claim their optimized paths qualified just because capability detection passes.

Rollback by disabling worker selection and returning to the compatible DOM implementation; keep the same IndexedDB schema. This does not make the earlier v3 application image compatible with an existing v4 catalog. Preserve active and rollback images and never clear operator browser data to test a rollback.
