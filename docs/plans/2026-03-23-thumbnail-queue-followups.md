# Thumbnail Queue Follow-Ups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the two branch review findings by removing retained import file handles from queued/completed ingestion sessions and preventing delayed thumbnail jobs from overwriting newer video state.

**Architecture:** Keep the existing queue/session model, but make session state lightweight after ingestion starts so the store does not retain raw `File` objects. In parallel, tighten thumbnail completion so persistence uses the latest aggregate state and the store merges thumbnail results into the current live video record instead of replacing it wholesale.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vitest

---

### Task 1: Lock the regressions with focused tests

**Files:**
- Modify: `src/presentation/stores/videosStore.spec.ts`
- Modify: `src/application/usecases/UpdateVideoThumbnailsUseCase.spec.ts`

**Step 1:** Add a store test that proves completed ingestion sessions no longer retain queued `VideoImportItem` file handles.

**Step 2:** Run the store spec and confirm the new test fails.

**Step 3:** Add a store/use-case regression that proves delayed thumbnail completion does not revert newer pinned state in the live store.

**Step 4:** Add a use-case regression that proves thumbnail persistence is based on the current aggregate rather than the stale request snapshot.

**Step 5:** Run the focused specs and confirm the new tests fail for the intended reasons.

### Task 2: Implement the minimal fixes

**Files:**
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/application/usecases/UpdateVideoThumbnailsUseCase.ts`

**Step 1:** Clear or detach queued `items` from session state once ingestion begins so `File` objects are not retained in `ingestionSessions`.

**Step 2:** Merge thumbnail persistence with the current aggregate in the use case.

**Step 3:** Merge thumbnail completion back into the current store video record so local state like `pinned` is preserved.

**Step 4:** Run the focused specs and confirm they pass.

### Task 3: Clean the lint fallout

**Files:**
- Modify only the already-dirty spec files with lint warnings

**Step 1:** Remove or use the flagged unused variables in the touched specs.

**Step 2:** Run `npm run lint` and confirm warnings are gone.

### Task 4: Re-verify the branch

**Files:**
- Modify only if verification reveals a concrete defect

**Step 1:** Run targeted specs for the changed areas.

**Step 2:** Run `npm run lint`.

**Step 3:** Run `npm run test:unit`.

**Step 4:** Run `npm run build`.
