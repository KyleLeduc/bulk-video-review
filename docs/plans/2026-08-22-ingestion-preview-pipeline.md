# Ingestion Preview Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace blocking full-resolution base64 timeline capture with a bounded, cancellable Blob preview pipeline and reuse timestamped frames for card animation and a seek-preview rail.

**Architecture:** Keep video metadata in the existing aggregate stores and add a dedicated IndexedDB record per video's preview frames. Generate scaled JPEG Blobs asynchronously through the existing browser adapter, persist them behind a new repository port, and expose them only on runtime `ParsedVideo` objects. The Pinia scheduler owns cancellation, backpressure, and diagnostics; presentation components own render-only Blob URLs.

**Tech Stack:** Vue 3, Pinia, TypeScript, IndexedDB, HTML video/canvas APIs, Vitest, Vue Test Utils

---

### Task 1: Add the preview-frame model and persistence port

**Files:**
- Create: `src/domain/entities/VideoPreviewFrame.ts`
- Create: `src/domain/repositories/IVideoPreviewRepository.ts`
- Create: `src/infrastructure/repository/VideoPreviewRepository.ts`
- Create: `src/infrastructure/repository/VideoPreviewRepository.spec.ts`
- Modify: `src/domain/entities/ParsedVideo.ts`
- Modify: `src/domain/entities/index.ts`
- Modify: `src/domain/repositories/index.ts`
- Modify: `src/infrastructure/repository/index.ts`
- Modify: `src/test-utils/index.ts`

**Step 1: Write the failing repository tests**

Test that `replaceFrames` writes one `{ videoId, frames }` record, `getFrames`
returns ordered frames, `deleteFrames` deletes one record, and `clear` clears the
preview store.

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/infrastructure/repository/VideoPreviewRepository.spec.ts --exclude '.worktrees/**'`

Expected: FAIL because the model and repository do not exist.

**Step 3: Implement the minimal model, port, repository, and exports**

Add `previewFrames: VideoPreviewFrame[]` only to `ParsedVideo`. Keep Blob payloads
out of `VideoEntity` and `VideoAggregate`.

**Step 4: Run the targeted tests**

Run: `npx vitest run src/infrastructure/repository/VideoPreviewRepository.spec.ts --exclude '.worktrees/**'`

Expected: PASS.

### Task 2: Create the database v4 preview store

**Files:**
- Create: `src/infrastructure/database/migrations/v4.ts`
- Modify: `src/infrastructure/database/DatabaseConnection.ts`
- Modify: `src/infrastructure/database/migrations/index.ts`
- Modify: `src/infrastructure/database/migrations/index.spec.ts`
- Modify: `src/domain/constants/index.ts`

**Step 1: Write the failing migration test**

Verify an upgrade from version 3 invokes v4 and creates
`VideoPreviewFrames` with key path `videoId`.

**Step 2: Run the test and verify the expected failure**

Run: `npx vitest run src/infrastructure/database/migrations/index.spec.ts --exclude '.worktrees/**'`

**Step 3: Add the store constant, v4 migration, and database version bump**

Do not translate or delete legacy `thumb`/`thumbUrls` records during upgrade.

**Step 4: Run the migration tests**

Run: `npx vitest run src/infrastructure/database/migrations/index.spec.ts --exclude '.worktrees/**'`

Expected: PASS.

### Task 3: Bound capture size, encode asynchronously, and clean up media

**Files:**
- Modify: `src/infrastructure/video/services/videoDomUtils.ts`
- Modify: `src/infrastructure/video/services/videoDomUtils.spec.ts`
- Modify: `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.ts`
- Create: `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts`
- Modify: `src/infrastructure/video/BrowserVideoFileParser.ts`
- Modify: `src/infrastructure/video/BrowserVideoFileParser.spec.ts`
- Modify: `src/application/ports/IVideoThumbnailGenerator.ts`

**Step 1: Write failing capture and lifecycle tests**

Cover these behaviors separately:

- A 3840x2160 source draws into a 480x270 canvas.
- Capture uses `toBlob` and returns timestamp, dimensions, and Blob size.
- Cover capture converts the bounded Blob to a data URL asynchronously.
- An already-aborted signal rejects with `AbortError`.
- Load/seek listeners and hidden video resources are released after success,
  error, timeout, and abort.
- The generator adapter pauses, removes `src`, and reloads its hidden video in
  `finally`.

**Step 2: Run the tests to prove the old synchronous path fails them**

Run: `npx vitest run src/infrastructure/video/services/videoDomUtils.spec.ts src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.spec.ts src/infrastructure/video/BrowserVideoFileParser.spec.ts --exclude '.worktrees/**'`

**Step 3: Implement bounded Blob capture and AbortSignal propagation**

Keep cover output compatible as a small data URL. Return timeline frames as
`VideoPreviewFrame[]`. Export one shared `disposeVideoElement` used by both the
parser and generator adapter.

**Step 4: Run the targeted media tests**

Run the command from Step 2. Expected: PASS.

### Task 4: Persist and hydrate preview frames through use cases

**Files:**
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.ts`
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
- Modify: `src/application/usecases/AddVideosFromFilesUseCase.ts`
- Modify: `src/application/usecases/AddVideosFromFilesUseCase.spec.ts`
- Modify: `src/application/usecases/UpdateVideoThumbnailsUseCase.ts`
- Modify: `src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts`
- Modify: `src/application/usecases/WipeVideoDataUseCase.ts`
- Create: `src/application/usecases/WipeVideoDataUseCase.spec.ts`
- Modify: `src/infrastructure/di/container.ts`

**Step 1: Write failing use-case tests**

Verify cached ingestion loads Blob previews, fresh ingestion starts with an
empty runtime list, thumbnail update persists frames before clearing legacy
timeline strings, abort does not publish or persist, missing aggregates do not
leave orphan previews, and wipe clears both aggregate and preview stores.

**Step 2: Run the tests and verify they fail for missing behavior**

Run: `npx vitest run src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts src/application/usecases/WipeVideoDataUseCase.spec.ts --exclude '.worktrees/**'`

**Step 3: Implement repository injection and runtime mapping**

Pass optional generation progress from the use case to the generator and emit a
`persisting` stage before the Blob store write.

**Step 4: Run targeted use-case tests**

Run the command from Step 2. Expected: PASS.

### Task 5: Add scheduler backpressure, cancellation, and diagnostics

**Files:**
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

**Step 1: Write failing scheduler tests**

Verify automatic concurrency is one, explicit concurrency is capped at two, a
new import aborts an active preview job, aborted work is requeued rather than
failed, removal aborts its active job, and diagnostic records include stage,
elapsed time, frame count, byte count, dimensions, and errors.

**Step 2: Run the tests and confirm the current scheduler fails them**

Run: `npx vitest run src/presentation/stores/videosStore.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts --exclude '.worktrees/**'`

**Step 3: Implement controllers, safe concurrency, and diagnostic state**

Keep ingestion higher priority than previews. Do not count `AbortError` as a
failure. Always settle the original job promise before the requeued job starts.

**Step 4: Run scheduler and diagnostics tests**

Run the command from Step 2. Expected: PASS.

### Task 6: Reuse preview frames in cards

**Files:**
- Modify: `src/presentation/components/VideoCard.vue`
- Modify: `src/presentation/components/VideoCard.spec.ts`

**Step 1: Write failing component tests**

Verify Blob URLs are created in timestamp order and revoked on replacement and
unmount, hover animates frames, leave resets to the cover, opening playback
clears animation timers, legacy URLs remain a fallback, and reduced-motion
users do not get automatic rotation.

**Step 2: Run the component test and verify failure**

Run: `npx vitest run src/presentation/components/VideoCard.spec.ts --exclude '.worktrees/**'`

**Step 3: Implement reactive preview sources and URL ownership**

Render only the active card image and pass the renderable timestamped sources
to `VideoEmbed`.

**Step 4: Run the component test**

Run the command from Step 2. Expected: PASS.

### Task 7: Add the accessible seek-preview rail and player cleanup

**Files:**
- Modify: `src/presentation/components/VideoEmbed.vue`
- Modify: `src/presentation/components/VideoEmbed.spec.ts`

**Step 1: Write failing player tests**

Verify pointer start/middle/end chooses the nearest frame without seeking,
range input seeks, keyboard changes update preview state, missing duration is
safe, loop enforcement remains intact, tooltip state resets, and unmount pauses
and unloads the media before releasing its source URL.

**Step 2: Run the player test and verify failure**

Run: `npx vitest run src/presentation/components/VideoEmbed.spec.ts --exclude '.worktrees/**'`

**Step 3: Implement the rail while retaining native controls**

Use one tooltip image, accessible range labels/value text, and pure nearest-
frame lookup for hover.

**Step 4: Run the player test**

Run the command from Step 2. Expected: PASS.

### Task 8: Verify and review the integrated change

**Files:**
- Review: all files changed by Tasks 1-7

**Step 1: Run formatting/lint and type checks**

Run: `npm run lint`

Run: `npm run type-check`

Expected: both exit 0.

**Step 2: Run the full unit suite**

Run: `npm run test:unit`

Expected: all tests pass with zero failures.

**Step 3: Build the production application**

Run: `npm run build`

Expected: exit 0.

**Step 4: Inspect the diff and request code review**

Confirm no FFmpeg/WebCodecs dependency, source media URLs and preview URLs have
distinct owners, Blob payloads are not added to `VideoEntity`, abort is not
reported as failure, and unrelated files are untouched.

**Step 5: Document the remaining browser acceptance gate**

Record that a representative repeated-import performance trace is still needed
before claiming the original real-browser lock-up is eliminated.
