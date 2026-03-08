# Deferred Failed Video Retries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Return cached videos first, process unseen videos next, and defer previously failing videos until the end of ingestion while still retrying them after the fast path completes.

**Architecture:** Extend the ingestion use case to partition each batch into cached, fresh, and deferred-retry groups. Back the retry group with a small persistent failure-state store keyed by generated video ID so repeated scans of the same folders keep known-bad files off the critical path. Clear failure state on successful ingestion or cache hits.

**Tech Stack:** TypeScript, Vitest, Vue 3, IndexedDB repositories, existing DI container

---

### Task 1: Lock the new ingestion ordering in tests

**Files:**
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`

**Step 1: Write the failing test**

Add tests that prove:
- cached videos are yielded before any new parsing work
- previously failed items are processed after unseen items
- successful retries clear failure state

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
Expected: FAIL because the use case has no failure-tracker dependency or deferred ordering yet.

**Step 3: Write minimal implementation**

Update the use case constructor contract and execution flow to partition items before parsing.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
Expected: PASS

### Task 2: Persist ingestion failure state

**Files:**
- Create: `src/application/ports/IVideoIngestionFailureTracker.ts`
- Create: `src/infrastructure/video/VideoIngestionFailureTracker.ts`
- Modify: `src/application/ports/index.ts`
- Modify: `src/infrastructure/video/index.ts`
- Modify: `src/domain/constants/index.ts`
- Modify: `src/infrastructure/database/DatabaseConnection.ts`
- Modify: `src/infrastructure/database/migrations/index.ts`
- Create: `src/infrastructure/database/migrations/v3.ts`

**Step 1: Write the failing test**

Prefer adding a small unit test for the tracker if needed, otherwise rely on use-case tests to drive the public behavior.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
Expected: FAIL until the tracker exists.

**Step 3: Write minimal implementation**

Store failure count and last failure timestamp by video ID in IndexedDB. Support:
- `hasFailure(videoId)`
- `recordFailure(videoId)`
- `clearFailure(videoId)`

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts`
Expected: PASS

### Task 3: Wire and verify

**Files:**
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.ts`
- Modify: `src/infrastructure/di/container.ts`
- Modify: `src/application/usecases/index.ts`

**Step 1: Write the failing test**

If wiring changes expose type issues, add or update a focused test for DI-adjacent behavior only if needed.

**Step 2: Run verification to catch regressions**

Run:
- `npm run test:unit -- src/application/usecases/LinearVideoIngestionUseCase.spec.ts src/infrastructure/video/BrowserVideoFileParser.spec.ts`
- `npm run type-check`

Expected: PASS

**Step 3: Commit**

```bash
git add src/application/ports src/application/usecases src/domain/constants src/infrastructure/database src/infrastructure/di src/infrastructure/video docs/plans/2026-03-08-defer-failed-video-retries.md
git commit -m "feat: defer retries for failed video ingestion"
```
