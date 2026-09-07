# Clips before prioritized seeks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the clip sweep before dispatching seek thumbnails, retaining newest-open priority within seek work.

**Architecture:** Modify the existing product selector in `videosStore.ts`; do not add a queue or alter product ownership. Queued clips run first; active clip jobs, including fallback and cache saving, hold a phase boundary before any new seeks. Once clips settle, dispatch newest-open pending seeks, then other pending seeks. Opening or closing a player never cancels active work. Additional imports retain the existing foreground-first interruption/retry policy; their clips precede pending seeks when background work resumes.

**Tech Stack:** Vue/Pinia, existing preview use case and Mediabunny/DOM adapters, Vitest and Cypress.

## Scope and tradeoff

Owner requested this scheduling change after reporting the Auto2 run seemed good. Initial/thumbnail Auto2, manual overrides, 1.5 s/20 FPS clips, 160 px seeks and blur/hidden pause stay unchanged. Closing the progress popup only dismisses its UI; closing a player releases seek priority without removing work. Background execution was a question, not approval to remove focus safeguards.

Ranking only queued clips would permit seeks to overlap the last active clips. The chosen phase boundary also waits for active clip/fallback persistence, matching the request that all clip generation remain first. An otherwise free slot may idle behind the last clip job; no additional throttle or separate worker pool is introduced. Sustained new imports can delay seeks, deliberately prioritizing gallery loops. Queue warmup and player priority do not preempt active seeks; new foreground imports and focus loss can still interrupt/retry them.

### Task 1: Regression tests before implementation

**Files:** `src/presentation/stores/videosStore.motionPreviews.spec.ts`

1. Keep the baseline (23 passing tests), then update one-worker open/close/reopen ordering assertions to require all three clips before any seek, newest-open first among seeks.
2. Update the Auto2 held-product test: freeing one slot starts the last queued clip; freeing another while that clip remains active must not start seeks; after its completion newest-open seeks dispatch first. Keep per-video exclusion and bounded concurrency assertions.
3. Add delayed clip-save and terminal-failure coverage so the barrier spans persistence but does not strand seeks. Add dismissal/active-work coverage using the actual toast and store.
4. Run `npx vitest run src/presentation/stores/videosStore.motionPreviews.spec.ts --exclude '.worktrees/**'`; verify new ordering assertions fail for the expected reason.

### Task 2: Minimal selector change

**Files:** `src/presentation/stores/videosStore.ts`

1. In `getNextThumbnailJob`, select queued `motionClips` before considering open-video seeks.
2. If any processing job has diagnostic product `motionClips`, return no new job while the clip phase drains (including fallback/save).
3. Then select newest-open pending keyframes, ordinary pending keyframes, and existing stale-job retirement. Preserve legacy still-only selector behavior.
4. Rerun the targeted tests green. Verify queue warmup/player priority do not cancel an active seek; preserve existing foreground-import interruption coverage.

### Task 3: Procedure, review and release

**Files:** `docs/testing/ingestion-clip-ux-smoke.md`; existing browser smoke or ignored release harness as appropriate.

1. Add v5 focused checks and explicitly supersede prior cross-product open-priority expectations; retain historical attempts.
2. Run targeted queue/toast tests, `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run build`, and `git diff --check`, serializing heavyweight commands. Request independent read-only review.
3. Commit only scoped files; preserve pre-existing backlog and primary-worktree edits. Push feature, require trusted CI for exact SHA, deploy immutable image on existing preprod, verify identity/readiness/HTTPS and actual browser order/completion with isolated media/cache state.
4. Reconcile Notion owner feedback, current feature progress and a new v5 test attempt. Handoff answers, exact preprod build and focused tests. No master integration, cleanup or further speed benchmarking is authorized.
