# Parallel Video Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve video ingestion and preview throughput and responsiveness with bounded browser workers, optimizing Chrome/Edge first while preserving the existing fallback.

**Architecture:** Reuse the existing foreground/preview schedulers and application ports. Introduce a small shared infrastructure worker pool for image processing, then qualify a worker-native metadata/preview backend behind the same ownership and persistence guarantees. No database migration, content-hash change, server processing, or isolation-header rollout is part of the initial implementation.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vite module workers, Vitest/Cypress, OffscreenCanvas; later WebCodecs and one explicitly approved demuxing dependency.

---

## Execution boundaries

This is a proposed plan, not an implementation record. Read the [design](2026-09-04-parallel-video-processing-design.md) first. Browser priority is confirmed; proposed budgets and acceptance targets remain baseline-gated. A demuxer choice is deliberately a checkpoint, not an invented dependency/API. Expand the qualified Phase C backend into library-specific red/green tasks after that decision.

Use @using-git-worktrees, @test-driven-development, @verification-before-completion, and @requesting-code-review during implementation. Create isolation with `npm run worktree -- add feat/parallel-video-processing`; bootstrap existing worktrees with `npm run worktree -- bootstrap <path>`. Reuse root dependencies and one development container. Run heavyweight commands sequentially. The current task only writes documentation, so it does not create a disposable implementation checkout.

For each code task below: add the listed regression first, run its command and observe the expected assertion failure (not a setup/import error), implement the smallest change, rerun to green, inspect the diff, and commit only its explicit files with the proposed message. Keep these red/run/implement/run/commit actions separate. Do not replace concrete browser acceptance with mocked API tests.

## Milestone 1 — Baseline and testable execution boundary

### Task 1: Record repeatable ingestion/preview baseline

**Modify:** `src/presentation/stores/videosStore.ts`, `src/presentation/components/utils/DiagnosticsPanel.vue`.

**Also modify for measured phase attribution:** `src/application/usecases/VideoIngestionUseCase.ts`, `src/application/ports/IVideoMetadataExtractor.ts`, `src/application/ports/IVideoThumbnailGenerator.ts`, `src/infrastructure/adapters/video/VideoMetadataExtractorAdapter.ts`, `src/infrastructure/video/BrowserVideoFileParser.ts`, `src/infrastructure/video/services/videoDomUtils.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.ts`, `src/application/usecases/LinearVideoIngestionUseCase.ts`, `src/application/usecases/UpdateVideoThumbnailsUseCase.ts`.

**Additional tests:** `src/infrastructure/video/BrowserVideoFileParser.spec.ts`, `src/infrastructure/video/services/videoDomUtils.spec.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts`, `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`, `src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts`.

**Tests:** `src/presentation/stores/videosStore.ingestionScheduler.spec.ts`, `src/presentation/stores/videosStore.previewScheduler.spec.ts`, `src/presentation/components/utils/DiagnosticsPanel.spec.ts`.

**Create:** `docs/testing/video-processing-performance.md`.

1. Add fake-clock tests for phase durations, queue wait vs execution time, settled/aborted counts, and a backend/fallback label. Assert session totals do not mix across new imports or retries.
2. Run `npx vitest run src/presentation/stores/videosStore.ingestionScheduler.spec.ts src/presentation/stores/videosStore.previewScheduler.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts --exclude '.worktrees/**'`; expect new assertions to fail.
3. Extend existing progress/options with a narrow optional phase-timing callback (`phase`, `durationMs`) and attach session/job identity in the coordinator, not the low-level encoder. Measure metadata load, seek/capture, encode, and awaited repository operations at the actual call boundaries; keep queue wait separate. Instrument UI latency in the browser harness, not with fabricated parser timings. Add fake-clock tests for each timing producer; run them with `npx vitest run src/infrastructure/video src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts --exclude '.worktrees/**'`. Keep sensitive names/file data out of exported measurements.
4. Repeat the command; expect all selected tests to pass. Record five baseline runs in actual Chrome and Edge with the design's fixed corpus and 1/2/4 foreground plus 1/2 preview settings. Use a disposable browser profile, never wipe the user's catalog.
5. Commit: `test: establish video processing performance baseline`.

**Checkpoint:** Identify whether DOM seeking, metadata, encoding, persistence, or rendering dominates. Keep budgets and a baseline report before optimization; do not promise a speedup if no browser measurement is available.

### Task 2: Introduce the shared frame-encoding seam

**Create:** `src/infrastructure/video/services/VideoFrameEncoder.ts`, `src/infrastructure/video/services/VideoFrameEncoder.spec.ts`.

**Modify:** `src/infrastructure/video/services/videoDomUtils.ts`, `src/infrastructure/video/BrowserVideoFileParser.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.ts`, `src/infrastructure/di/container.ts`.

**Existing tests:** `src/infrastructure/video/services/videoDomUtils.spec.ts`, `src/infrastructure/video/BrowserVideoFileParser.spec.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts`.

1. Test a supplied encoder is used by both cover and preview capture. Lock existing timestamp selection, width cap/aspect ratio/no upscaling, JPEG quality, cover data URL, Blob preview frames, abort, and timeout behavior.
2. Run `npx vitest run src/infrastructure/video src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts --exclude '.worktrees/**'`; observe the new delegation assertion fail.
3. Move only the shared encoding responsibility behind an infrastructure-local dependency. Retain the current DOM implementation as the default. Inject from DI; do not import the container into helpers or change domain models/application interfaces here.
4. Rerun to green; inspect that metadata, preview timestamps, and file IDs remain unchanged.
5. Commit: `refactor: make video frame encoding replaceable`.

## Milestone 2 — Bounded worker image processing

### Task 3: Add protocol, capacity, and worker lifecycle

**Create:** `src/infrastructure/video/workers/videoWorkerProtocol.ts`, `src/infrastructure/video/workers/VideoWorkerPool.ts`, `src/infrastructure/video/workers/VideoWorkerPool.spec.ts`.

Keep the first protocol limited to encoding, cancellation, readiness, progress, and terminal results. A proposed infrastructure-only request shape is:

```ts
type EncodeFrameRequest = {
  version: 1
  kind: 'encode-frame'
  requestId: string
  generation: number
  bitmap: ImageBitmap
  timestampSeconds: number
  maxWidth: number
  quality: number
}
type CancelRequest = {
  version: 1
  kind: 'cancel'
  requestId: string
  generation: number
}
```

1. Write fake-worker tests: capacity never exceeded, cancellation removes queued jobs, old generation responses cannot settle new jobs, one terminal settlement, timeout/crash/messageerror frees resources, rejected transfer closes caller-owned bitmap, and only one pool serves both consumers. Test raw-byte reservations across consumers: an oversized source is rejected before bitmap capture; a second admissible job waits without allocating when bytes are reserved; success/abort/transfer failure/termination release exactly once; dimensions and output byte/pixel caps reject invalid inputs.
2. Run `npx vitest run src/infrastructure/video/workers/VideoWorkerPool.spec.ts --exclude '.worktrees/**'`; expect the new scheduling assertions to fail after minimal exports exist.
3. Implement only that queue/lifecycle. Suggested auto policy and its executable expectations:

   ```ts
   export function autoWorkerCapacity(hint: number | undefined): number {
     const cores =
       Number.isFinite(hint) && Number(hint) >= 1 ? Math.floor(Number(hint)) : 2
     return Math.max(1, Math.min(2, Math.floor(cores / 2)))
   }
   // Test undefined/NaN/0 => 1; 1/2/3 => 1; 4/8/32 => 2.
   ```

   Bound waiting requests to the current scheduler's finite active jobs; acquire capacity and a source-pixel byte reservation before a full-resolution capture. Use the design's Phase B 128 MiB app-owned raw budget and conservative 8-bytes-per-pixel estimate; reject overflow/non-finite dimensions and cap destination pixels/output bytes. Do not claim to bound native decoder memory. Add startup/job deadlines and cancel-then-terminate grace. The response union must carry matching version/request/generation and structured error fields; validate them before dispatching.

4. Rerun to green; prove no unresolved promise remains after disposal, including workers still starting.
5. Commit: `feat: add bounded video worker execution`.

### Task 4: Encode real frames in a module worker

**Create:** `src/infrastructure/video/workers/videoProcessing.worker.ts`, `src/infrastructure/video/services/WorkerVideoFrameEncoder.ts`, `src/infrastructure/video/services/WorkerVideoFrameEncoder.spec.ts`.

**Modify:** `src/infrastructure/di/container.ts` and the Task 2 encoder seam.

1. Test the design's eligibility matrix: Phase B works on HTTP and HTTPS when enabled/capable; it does not require `isSecureContext` or `crossOriginIsolated`. Test missing `Worker`/OffscreenCanvas/2D context/convertToBlob fallback, failed worker startup, memory admission before capture, single fallback on encoding failure, and **no fallback on AbortError**. Chrome/Edge is qualification priority, not a user-agent gate.
2. Run `npx vitest run src/infrastructure/video/services/WorkerVideoFrameEncoder.spec.ts src/infrastructure/video/workers/VideoWorkerPool.spec.ts --exclude '.worktrees/**'`; expect the new backend assertions to fail.
3. Bundle workers with `new Worker(new URL('./videoProcessing.worker.ts', import.meta.url), { type: 'module' })` from the worker-directory factory. Negotiate capabilities in the worker, transfer one captured bitmap, render to bounded OffscreenCanvas, and return a JPEG Blob. Close the bitmap in `finally`; do not return unreleased full-resolution frames. Keep image work inside the existing slot, never recursively acquire it.
4. Rerun to green; then run `npm run build` and inspect emitted worker chunks, MIME types, paths, and CSP compatibility on the built app. Do not widen CSP or add CDN worker URLs to make a failing build work.
5. Commit: `feat: encode video frames off the main thread`.

### Task 5a: Establish cancellation and wipe ordering before enablement

**Modify:** `src/application/usecases/VideoIngestionUseCase.ts`, `src/application/ports/IVideoMetadataExtractor.ts`, `src/infrastructure/video/IVideoFileParser.ts`, `src/infrastructure/adapters/video/VideoMetadataExtractorAdapter.ts`, `src/infrastructure/video/BrowserVideoFileParser.ts`, `src/infrastructure/video/services/videoDomUtils.ts`, `src/application/usecases/LinearVideoIngestionUseCase.ts`, `src/presentation/stores/videosStore.ts`, `src/presentation/components/utils/DiagnosticsPanel.vue`.

**Tests:** existing parser/DOM tests, `src/application/usecases/LinearVideoIngestionUseCase.concurrency.spec.ts`, store ingestion/preview scheduler tests, `src/presentation/components/utils/DiagnosticsPanel.spec.ts`; create `src/infrastructure/adapters/video/VideoMetadataExtractorAdapter.spec.ts`.

1. Add regressions for abort during metadata/cover, AbortError crossing the parser/adapter unchanged, queued items never starting after invalidation, no cancellation entries in failure history, and no registration/publication after cancellation. Add a wipe test with a deferred metadata result and a separate already-started database write: wipe must await the latter, then clear storage; a late metadata result must never start a new write.
2. Run `npx vitest run src/infrastructure/video src/infrastructure/adapters/video/VideoMetadataExtractorAdapter.spec.ts src/application/usecases/LinearVideoIngestionUseCase.concurrency.spec.ts src/presentation/stores/videosStore.ingestionScheduler.spec.ts src/presentation/stores/videosStore.previewScheduler.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts --exclude '.worktrees/**'`; observe new cancellation/order assertions fail.
3. Add optional signals to the existing options and forward them through each adapter/parser/DOM call. Preserve AbortError and add an explicit cancelled outcome/counter so cancellation is not failure. Check cancellation before persistence, failure-history updates, session registration, and publication; stop admitting queued work on invalidation. Keep existing foreground imports sequential by session rather than cancelling them on every new import.
4. Add a store-owned cancel/drain/wipe action using the existing injected wipe use case. Prevent concurrent imports/reentrant wipes, invalidate all relevant generations, abort and await foreground/preview jobs plus their accepted persistence, then call `WipeVideoDataUseCase.execute()`, clear session Files/URLs/state, and reopen admission in `finally`. Route the diagnostics button through that action instead of calling the wipe use case directly. Cancellation cannot undo an already accepted transaction; ordering the wipe after settlement supplies the guarantee. Apply the same signal lifecycle on app disposal without promising asynchronous completion after browser process exit.
5. Rerun to green and `npm run type-check`; commit `feat: coordinate video cancellation and catalog wipe` before enabling Phase B. This is an explicit implementation prerequisite, not a claim that current master already has these protections.

### Task 5b: Prove scheduler, cancellation, and persistence compatibility

**Modify/tests:** `src/presentation/stores/videosStore.ts`, its `videosStore.ingestionScheduler.spec.ts` and `videosStore.previewScheduler.spec.ts`, `src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts`, `src/infrastructure/repository/VideoPreviewRepository.spec.ts`.

1. Test a new import cancels a worker preview and waits for cleanup before foreground work starts; a cancelled/late result cannot persist; terminal counters settle once; fallback does not exceed the shared budget; disposal does not leak object URLs; votes/pins made during processing survive.
2. Run `npx vitest run src/presentation/stores/videosStore.ingestionScheduler.spec.ts src/presentation/stores/videosStore.previewScheduler.spec.ts src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts src/infrastructure/repository/VideoPreviewRepository.spec.ts --exclude '.worktrees/**'` and observe new assertions fail.
3. Add only the wiring/lifecycle guards required by those failures. Keep the existing transaction-completion boundary and preview-set replacement. Discarding a completed stale Blob is safe; submitting it for persistence is not.
4. Rerun to green. Repeat Phase A browser measurements; report UI and throughput separately. Retain default-off worker selection if gains or stability are unproven.
5. Commit: `test: preserve ingestion guarantees with worker previews`.

## Milestone 3 — Worker-native ingestion and previews (decision-gated)

### Task 6: Qualify demuxing and establish exact backend contract

**Create:** `docs/decisions/video-worker-demuxer.md`.

**Conditional modify:** `package.json`, `package-lock.json` only after dependency approval. Do not bundle BVR-001's general dependency refresh into this task.

1. Compare maintained demuxing candidates from primary docs against bounded File range reads, MP4/H.264 metadata/keyframe indexing, cancellation, browser/worker support, license, bundle cost, rotation/VFR handling, and production asset packaging. The archived lab is reference only.
2. Record the choice, rejected alternatives, exact version/runtime requirements, and tests needed; ask for the new dependency approval before installation.
3. Run a built-browser spike in the existing shared environment using private local fixtures: extract duration and cover, then indexed preview timestamps. Verify `isSecureContext` and `VideoDecoder.isConfigSupported` in the worker; verify HTTP/unsupported-codec uses the DOM metadata/decoding path (which may still use eligible Phase B encoding).
4. Measure compressed-buffer and application-held frame limits from the design. Reject full-file buffering and unbounded sequential decode for long inputs. Treat missing indexes, enormous dimensions/GOPs, and unsupported orientation/color as fallback cases.
5. Expand Tasks 7–8 into exact library-API red/green tasks before coding them; commit the decision/evidence with `docs: qualify worker video demuxing backend`.

**Stop gate:** If no bounded supported backend is justified, retain Milestone 2 and report that full worker-native ingestion is deferred. Do not silently choose threaded FFmpeg or implement a bespoke container parser.

### Task 7: Add worker metadata and cover extraction

**Create:** `src/infrastructure/video/WorkerVideoFileParser.ts`, `src/infrastructure/video/WorkerVideoFileParser.spec.ts`.

**Modify:** `src/infrastructure/video/workers/videoProcessing.worker.ts`, `src/infrastructure/video/workers/videoWorkerProtocol.ts`, `src/infrastructure/di/container.ts`.

**Regression tests:** `src/infrastructure/video/BrowserVideoFileParser.spec.ts`, `src/infrastructure/video/services/FileHashGenerator.spec.ts`, `src/application/usecases/LinearVideoIngestionUseCase.concurrency.spec.ts`.

1. Test identical IDs, finite duration, preserved cover timestamp policy, one DOM fallback on unsupported config/runtime failure, zero fallback on cancellation, explicit deadlines, bounded resources, and caller/registry object-URL ownership. Use a qualified demuxer fixture for metadata semantics, not only mocks.
2. Run `npx vitest run src/infrastructure/video src/application/usecases/LinearVideoIngestionUseCase.concurrency.spec.ts --exclude '.worktrees/**'`; observe the worker-path assertions fail.
3. Implement the qualified adapter behind the `IVideoFileParser`/metadata-extractor wiring extended by Task 5a; carry its cancellation signal and preserve AbortError. Keep identity generation unchanged. Worker input is a structured-cloned File, not a full-file ArrayBuffer; output preserves `VideoMetadataExtractionResult` and current cover representation. Keep runtime-specific APIs out of application/domain layers.
4. Rerun to green and run the built-browser MP4/H.264 corpus on Chrome and Edge. Confirm current playability policy and duplicate/retry ordering before adding more formats.
5. Commit: `feat: extract eligible video metadata in workers`.

### Task 8: Add original-file access for worker preview decoding

**Modify:** `src/application/ports/IVideoThumbnailGenerator.ts`, `src/application/ports/IVideoSessionRegistry.ts`, `src/infrastructure/video/services/VideoSessionRegistry.ts`, `src/application/usecases/UpdateVideoThumbnailsUseCase.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.ts`, worker protocol/implementation.

**Tests:** `src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts`; create `src/infrastructure/video/services/VideoSessionRegistry.spec.ts` if no equivalent registry tests exist at implementation time.

1. Test optional original File access without changing URL reference counts; absent File uses DOM; unregistration invalidates new worker starts; late results after abort/wipe are rejected. Keep the fallback URL acquired and released by the existing use case.
2. Run `npx vitest run src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts src/infrastructure/video/services --exclude '.worktrees/**'`; expect new source/ownership assertions to fail.
3. Replace the URL-only thumbnail input with the explicit source `{ url: string; file?: File }` and add registry `getFile(videoId): File | null`. Update every implementation/call site/mock found by searching `generateThumbnails` and `IVideoSessionRegistry`; use type-check to find omissions. A worker receives the File, while DOM fallback uses the still-owned URL.
4. Add worker-native preview jobs to the same pool. Use preceding-keyframe decode with bounded queues, presentation-timestamp selection, correct timestamp units, ordered output, and immediate `VideoFrame.close()` for unused frames. Return the existing Blob frame shape, and persist only a complete valid current-generation result.
5. Rerun selected tests and `npm run type-check`; run real timestamp/rotation/VFR/long-GOP fixtures. Commit: `feat: generate eligible video previews in workers`.

## Milestone 4 — Browser evidence and staged enablement

### Task 9: Add built-browser worker/fallback acceptance

**Create:** `cypress/e2e/video-worker-processing.cy.ts` and small redistributable fixtures under `cypress/fixtures/video-workers/` with provenance/license notes.

**Modify:** `src/presentation/components/utils/DiagnosticsPanel.vue`, its spec, and `docs/testing/video-processing-performance.md`.

1. Write failing browser tests for actual emitted worker startup, supported encode/decode, blocked worker startup, unsupported codecs, timeout/cancel/reimport, persisted previews after reload, and session opt-out. Assert visible backend/fallback reason; do not stub out the worker in the acceptance path.
2. Run `npm run build`, then `npm run test:e2e` sequentially. Expected new feature assertions fail before their final diagnostics/opt-out wiring is added; existing behavior stays green.
3. Add minimal session-scoped selection/opt-out and diagnostics. Use the eligibility matrix, not browser-name detection. Chrome/Edge is the qualification priority; capable other browsers may select workers but remain unqualified until measured. Test missing-capability and forced opt-out fallback in Firefox/Safari. Avoid persistent flags whose meaning can drift across releases.
4. Run, sequentially: `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run test:ci`, `npm run build`, `npm run test:e2e`. Require all available gates to pass; document environment limitations rather than claiming unrun acceptance.
5. Perform five comparable native Chrome and Edge runs with the design's corpus, cold/warm separation, p95 UI responsiveness, end-to-end throughput, peak memory observations, all failure cases, and both HTTP Phase B eligibility and HTTP Phase C fallback. Check ≥20% median eligible-corpus improvement and ≤5% fallback regression as proposed baseline-gated targets; report if targets are revised before rollout.
6. Commit: `test: qualify worker video processing in browsers`.

### Task 10: Review and hand off for an authorized preprod release

**Modify:** `docs/backlog.md` and `docs/testing/video-processing-performance.md` with measured status, not optimistic completion checkboxes.

1. Request an architecture/code review against the design, especially ownership, stale writes, bounded allocations, cancel/fallback behavior, and dependency direction. Resolve important findings and rerun affected tests.
2. Present which milestone is qualified, which codecs/browsers remain fallback, exact before/after measurements, and remaining risks. No deployment is implied by completing this implementation plan.
3. When separately authorized, use the existing homelab immutable-image preprod deployment/smoke runbook against the current preprod, not a new sandbox. Preserve live/rollback images and all operator data.
4. Verify worker chunk delivery and real Chrome/Edge capabilities against the deployed build. Infrastructure health checks alone cannot prove UI correctness or worker performance.
5. Exercise session opt-out back to DOM without a database migration or catalog reset. Close BVR-002 only for the proven scope; retain explicit follow-ups for unqualified backend/format work.

**Future-only checkpoint:** Threaded WASM/shared memory would require a separate measured proposal, runtime/resource design, dependency approval, and homelab isolation-header compatibility/rollout plan. HTTPS by itself is not that approval or prerequisite completion.
