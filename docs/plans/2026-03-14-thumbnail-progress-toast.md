# Thumbnail Progress Toast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the ingestion toast visible until thumbnail generation work is done, and reuse the existing meter to show thumbnail generation progress after file ingestion completes.

**Architecture:** Extend store-level thumbnail queue state with a small computed progress model that the toast can consume without duplicating queue math. Update the toast to switch its meter, legend, stats, and auto-dismiss behavior from ingestion mode to thumbnail mode once file ingestion is complete but thumbnail work is still pending.

**Tech Stack:** Vue 3 Composition API, Pinia, Vitest, Vue Test Utils

---

### Task 1: Add Toast Regression Coverage

**Files:**
- Modify: `src/presentation/components/utils/IngestionStatusToast.spec.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- the toast stays visible after ingestion completes while thumbnail jobs are still queued or processing
- the existing meter and labels switch to thumbnail-generation progress in that state
- the toast auto-dismisses only after thumbnail jobs finish successfully

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/presentation/components/utils/IngestionStatusToast.spec.ts`

**Step 3: Commit**

Do not commit yet; continue once the red state is confirmed.

### Task 2: Expose Thumbnail Progress State From The Store

**Files:**
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Write the failing store test**

Add a focused test for a computed thumbnail progress summary that reports:
- total tracked thumbnail jobs
- generated/ready count
- in-flight count
- failed count
- whether thumbnail work is still active

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/presentation/stores/videosStore.spec.ts`

**Step 3: Write minimal implementation**

Add a computed summary in the store and return it from `useVideoStore`.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/presentation/stores/videosStore.spec.ts`

### Task 3: Update Toast Behavior And Meter

**Files:**
- Modify: `src/presentation/components/utils/IngestionStatusToast.vue`

**Step 1: Implement the minimal toast changes**

Update the toast so that:
- rendering is driven by store progress plus thumbnail work, not just `isIngesting`
- the meter, legend, queue text, and stat labels switch to thumbnail-generation mode after ingestion completes
- auto-dismiss starts only when thumbnail work has fully completed without failures

**Step 2: Run the toast tests**

Run: `npm run test:unit -- src/presentation/components/utils/IngestionStatusToast.spec.ts`

### Task 4: Verify The Integrated Behavior

**Files:**
- Modify as needed from earlier tasks only

**Step 1: Run focused regression tests**

Run: `npm run test:unit -- src/presentation/components/utils/IngestionStatusToast.spec.ts src/presentation/stores/videosStore.spec.ts`

**Step 2: Run type-check**

Run: `npm run type-check`

**Step 3: Run the full unit suite if focused tests pass**

Run: `npm run test:unit`
