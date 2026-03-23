# Ingestion Queue And Thumbnail Pause Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the pre-merge review findings by making ingestion session state explicit, queueing new imports instead of overwriting the current session, pausing thumbnail draining when a new import is queued, and tightening the related tests.

**Architecture:** Replace the store's single mutable ingestion snapshot with an explicit FIFO ingestion-session queue. A new import request should create a queued session, suspend the thumbnail scheduler from starting new work, wait for any currently running thumbnail jobs to settle, then run queued ingestions one at a time before thumbnail draining resumes. Drive the toast, diagnostics panel, and upload control from the same session model so UI state does not duplicate queue math or drift from the store.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vitest, Vue Test Utils

---

### Task 1: Lock The Regression Cases Before Refactoring

**Files:**
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`
- Modify: `src/presentation/components/utils/IngestionStatusToast.spec.ts`
- Modify: `src/presentation/components/inputs/FileInput.spec.ts`
- Create: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

**Step 1: Write the failing ingestion-progress regression test**

Add a use-case test that covers:
- all non-cached items failing during partition
- cached items plus partition failures with no `processItem` loop iterations
- the final emitted progress snapshot reporting `completedCount === total`

**Step 2: Run the use-case regression test and confirm it fails**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts`

Expected: FAIL because `completedCount` does not include `partitionFailures` when no processing-loop progress event runs.

**Step 3: Write the failing queue/preemption store tests**

Add store tests that prove:
- a second import request is queued instead of ignored or merged into the current session
- queued imports stop new thumbnail jobs from being scheduled immediately
- already-running thumbnail jobs are allowed to settle before the next ingestion starts
- thumbnail draining resumes only after the ingestion queue is empty

**Step 4: Run the store tests and confirm they fail**

Run: `npm run test:unit -- src/presentation/stores/videosStore.spec.ts`

Expected: FAIL because the store currently overwrites session state and keeps draining thumbnails.

**Step 5: Write the failing toast, file-input, and diagnostics tests**

Add presentation tests that prove:
- the toast follows the current queued/active session instead of switching silently to unrelated global counts
- the upload control queues a second import rather than disabling itself for the entire drain phase
- diagnostics distinguishes `active ingestion`, `queued ingestions`, and `thumbnail drain paused`

**Step 6: Run the targeted presentation tests and confirm they fail**

Run: `npm run test:unit -- src/presentation/components/utils/IngestionStatusToast.spec.ts src/presentation/components/inputs/FileInput.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts`

Expected: FAIL because the current UI reads from a single mutable ingestion snapshot.

**Step 7: Commit**

Do not commit yet. Keep the suite red until Tasks 2-6 are complete.

### Task 2: Tighten The Ingestion Contract And Fix Progress Accounting

**Files:**
- Modify: `src/application/usecases/VideoIngestionUseCase.ts`
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.ts`
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
- Modify: `src/test-utils/index.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Remove the legacy `ParsedVideo` fallback from the ingestion contract**

Change `VideoIngestionUseCase.execute()` so it returns `AsyncGenerator<VideoIngestionEvent>` only. Delete `VideoIngestionOutput` and the store-side runtime guard that tolerates bare `ParsedVideo` values.

**Step 2: Update the default test harness to emit explicit ingestion events**

Change `createPresentationTestContext()` so default `addVideosUseCase.execute()` mocks yield typed `video`/`progress` events, not legacy bare `ParsedVideo` values.

**Step 3: Fix the partition-failure accounting bug**

Initialize the first progress snapshot so `completedCount` includes both:
- `cachedVideos.length`
- `partitionFailures`

Keep later progress updates monotonic and derived from explicit counters instead of relying on loop execution.

**Step 4: Run the ingestion and store tests**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/presentation/stores/videosStore.spec.ts`

Expected: PASS for the partition-failure case and contract-shape updates.

**Step 5: Commit**

```bash
git add src/application/usecases/VideoIngestionUseCase.ts src/application/usecases/LinearVideoIngestionUseCase.ts src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/test-utils/index.ts src/presentation/stores/videosStore.spec.ts
git commit -m "fix: tighten ingestion event contract"
```

### Task 3: Introduce Explicit Ingestion Sessions And Queue Semantics In The Store

**Files:**
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Add explicit session types in the store**

Define an internal session model with:
- stable `sessionId`
- `files` or normalized import items
- `status` such as `queued`, `ingesting`, `awaiting-thumbnail-drain`, `thumbnailing`, `completed`, `failed`
- session-scoped progress/timing fields
- session-scoped thumbnail video IDs and thumbnail counters

Do not create a new cross-repo abstraction here; keep the types local to `videosStore.ts` unless the file becomes unreadable during implementation.

**Step 2: Replace the single-session refs with queue-aware state**

Refactor:
- `ingestionProgress`
- `ingestionStartedAtMs`
- `ingestionCompletedAtMs`
- `ingestionThumbnailVideoIds`

into queue-aware state plus a small set of computed selectors:
- `activeIngestionSession`
- `queuedIngestionCount`
- `displaySession`
- `displaySessionProgress`
- `displaySessionThumbnailProgress`
- `isThumbnailDrainPaused`

**Step 3: Change the public import API to enqueue work**

Update `addVideosFromFiles(files)` so it:
- normalizes files immediately
- creates a queued session
- starts ingestion immediately only when no higher-priority ingest is active and no thumbnail workers are still settling after a preemption

**Step 4: Pause thumbnail draining when a new import is queued**

Implement the pause rule as:
- stop scheduling any new thumbnail jobs immediately when an import session is queued
- if thumbnail jobs are already running, let them settle instead of starting more
- once `activeThumbnailJobs` reaches `0`, begin the next queued ingestion session
- resume thumbnail draining only after the ingestion queue is empty

Assumption for this task: "pause in flight" means pausing the scheduler boundary and waiting for active workers to settle. Do not add `AbortSignal`-style mid-thumbnail cancellation in this change unless the current implementation proves this assumption unacceptable.

**Step 5: Associate thumbnail jobs with sessions**

Extend thumbnail job bookkeeping so each tracked thumbnail belongs to a session. Session-scoped thumbnail progress must never be recomputed from global queue counts alone.

**Step 6: Run the store tests**

Run: `npm run test:unit -- src/presentation/stores/videosStore.spec.ts`

Expected: PASS for queued imports, paused thumbnail draining, resumed draining, and session-scoped progress.

**Step 7: Commit**

```bash
git add src/presentation/stores/videosStore.ts src/presentation/stores/videosStore.spec.ts
git commit -m "feat: queue ingestion sessions ahead of thumbnail drain"
```

### Task 4: Rebuild The Toast And Upload Control Around The Session Queue

**Files:**
- Modify: `src/presentation/components/utils/IngestionStatusToast.vue`
- Modify: `src/presentation/components/utils/IngestionStatusToast.spec.ts`
- Modify: `src/presentation/components/inputs/FileInput.vue`
- Modify: `src/presentation/components/inputs/FileInput.spec.ts`
- Modify: `src/App.vue`
- Modify: `src/App.spec.ts`

**Step 1: Point the toast at the store’s display-session selectors**

Update the toast so it renders from the selected session only, not raw global thumbnail counts. The meter, labels, timing, and dismiss behavior should all come from the same session object.

**Step 2: Make queued imports visible**

Add small queue context to the toast header or stats row, for example:
- queued import count
- thumbnail drain paused/running state

Do not mix session-scoped meter data with global backlog counts in the same sentence.

**Step 3: Change file-input behavior from "disable" to "enqueue"**

Update `FileInput.vue` so:
- the picker remains usable while thumbnail drain is paused or active
- a second import request queues cleanly
- the label explains the current mode, such as `Queue videos` or `1 import queued`

Only disable the control during the narrow period where duplicate picker interaction would be unsafe, not for the entire lifetime of background thumbnail work.

**Step 4: Run the toast, file-input, and app tests**

Run: `npm run test:unit -- src/presentation/components/utils/IngestionStatusToast.spec.ts src/presentation/components/inputs/FileInput.spec.ts src/App.spec.ts`

Expected: PASS for queue-aware progress and upload behavior.

**Step 5: Commit**

```bash
git add src/presentation/components/utils/IngestionStatusToast.vue src/presentation/components/utils/IngestionStatusToast.spec.ts src/presentation/components/inputs/FileInput.vue src/presentation/components/inputs/FileInput.spec.ts src/App.vue src/App.spec.ts
git commit -m "feat: surface queued ingestion sessions in the UI"
```

### Task 5: Make Diagnostics Reflect Real Queue State

**Files:**
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Add explicit diagnostics-facing selectors in the store**

Expose compact computed state for:
- active ingestion session summary
- queued ingestion count
- paused/running thumbnail drain state
- effective thumbnail concurrency
- current session thumbnail summary

**Step 2: Update the panel copy**

Render:
- `No active ingestion session` only when no session is currently ingesting
- queued session count separately
- whether thumbnail draining is paused for queued ingestion or actively running

Do not infer "active" from the existence of historical progress data.

**Step 3: Add direct diagnostics coverage**

Create `DiagnosticsPanel.spec.ts` to cover:
- idle state
- active ingestion state
- queued import state
- thumbnail concurrency selector behavior

**Step 4: Run diagnostics-focused tests**

Run: `npm run test:unit -- src/presentation/components/utils/DiagnosticsPanel.spec.ts src/presentation/stores/videosStore.spec.ts`

Expected: PASS with no stale-session rendering.

**Step 5: Commit**

```bash
git add src/presentation/components/utils/DiagnosticsPanel.vue src/presentation/components/utils/DiagnosticsPanel.spec.ts src/presentation/stores/videosStore.ts src/presentation/stores/videosStore.spec.ts
git commit -m "feat: expose queue-aware ingestion diagnostics"
```

### Task 6: Reduce Low-Signal Tests And Clean Up The Video Card

**Files:**
- Modify: `src/presentation/components/VideoCard.vue`
- Modify: `src/presentation/components/VideoCard.spec.ts`
- Modify: `src/presentation/views/VideoGallery.spec.ts`

**Step 1: Remove dead video-card state**

Delete any state that is no longer read, starting with `rotateThumbs`, and keep the hover-warmup logic grouped together with clear local helper names.

**Step 2: If the component still reads poorly, extract only the hover-warmup state machine**

If `VideoCard.vue` remains hard to scan after dead-state removal, extract the timer/ring logic into a local composable next to the component, for example `src/presentation/components/useThumbnailWarmupState.ts`. Only do this if it materially shortens the component and simplifies the spec.

**Step 3: Replace the source-text layout assertions**

Remove tests that read `.vue` source code for CSS strings. Keep or replace them only with behavior-level coverage that can actually fail when runtime wiring breaks.

For this branch:
- keep hover-warmup behavior tests in `VideoCard.spec.ts`
- delete the source-text checks for `aspect-ratio`, `box-sizing`, and `gap: 0`
- only add replacement tests if they assert actual runtime behavior rather than string literals

**Step 4: Run the focused component tests**

Run: `npm run test:unit -- src/presentation/components/VideoCard.spec.ts src/presentation/views/VideoGallery.spec.ts`

Expected: PASS with fewer brittle assertions.

**Step 5: Commit**

```bash
git add src/presentation/components/VideoCard.vue src/presentation/components/VideoCard.spec.ts src/presentation/views/VideoGallery.spec.ts
git commit -m "refactor: simplify thumbnail warmup coverage"
```

### Task 7: Verify The Integrated Branch Before Merge

**Files:**
- Modify only if verification reveals a concrete defect

**Step 1: Run the targeted regression suite**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/presentation/stores/videosStore.spec.ts src/presentation/components/utils/IngestionStatusToast.spec.ts src/presentation/components/inputs/FileInput.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts src/presentation/components/VideoCard.spec.ts`

**Step 2: Run type-check**

Run: `npm run type-check`

**Step 3: Run the full unit suite**

Run: `npm run test:unit`

**Step 4: Run the production build**

Run: `npm run build`

**Step 5: Manual smoke in the worktree dev server**

Verify in the browser:
- import batch A
- let thumbnail draining begin
- import batch B while A is draining
- confirm new import is queued, thumbnail drain pauses, batch B ingests after active thumbnail workers settle, and thumbnail draining resumes after the queue empties
- confirm the toast and diagnostics stay coherent throughout

**Step 6: Request code review before merge**

Use the `requesting-code-review` skill against the final branch diff versus `master`.

**Step 7: Commit any final fixes**

```bash
git add .
git commit -m "fix: harden ingestion queue and thumbnail progress flow"
```
