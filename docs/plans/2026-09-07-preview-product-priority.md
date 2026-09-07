# Product-aware Preview Scheduling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prioritize seek thumbnails for newly opened videos, generate other clips before background seeks, and expose understandable per-product progress.

**Architecture:** Keep the existing bounded scheduler in `videosStore`, with one complete preview product per dispatch. Keep the existing per-video completion promise, cancellation/source ownership, cache and ingestion-session lifecycle. Opening/closing a player supplies scheduling intent; UI derives clip/seek readiness from products and job diagnostics instead of introducing another job manager.

**Tech Stack:** Vue 3, Pinia, TypeScript, Mediabunny worker adapters, Vitest.

## Approved behavior and limits

- Pending seeks for open players outrank pending clips; newly opened player goes first among open players. Closing/filtering/removal releases priority.
- Otherwise clips precede background seeks, FIFO within a priority class. At most the existing configured concurrency, and never two products for the same video at once.
- Finish the running product before reprioritizing. Focus loss still aborts an incomplete product and pauses dispatch; complete products survive.
- Import, explicit retry and backfill use the same queue. Unsupported products do not prevent the other product; failures do not auto-retry on hover/open. Explicit retry may retry failed products.
- Show separate clip-ready / seek-ready video counts, active product/stage, paused and failed states. Do not fabricate per-frame progress or an ETA. The card must distinguish clips ready with seeks pending from a missing clip preview.
- Keep 1.5 s / 20 FPS clips and 160 px seek images. No dependency, cache schema, source metadata or benchmark policy changes.
- This turn implements and verifies; no commit/publication/master integration unless separately requested. Existing owner smoke v1 remains historical evidence; append v2 instructions for a future build.

## Task 1: Single-product dispatch and scheduling

**Files:** `src/application/usecases/UpdateVideoPreviewsUseCase.ts`, its `.spec.ts`, `src/presentation/stores/videosStore.ts`, `videosStore.motionPreviews.spec.ts`.

1. Run baseline: `npx vitest run src/application/usecases/UpdateVideoPreviewsUseCase.spec.ts src/presentation/stores/videosStore.motionPreviews.spec.ts src/presentation/stores/videosStore.previewScheduler.spec.ts --exclude '.worktrees/**'` (expect pass).
2. Add failing use-case tests for `execute(video, { product: 'keyframes' })`: only requested product generated/cached; default retains both-product API behavior.
3. Run targeted use-case test, observe failure, then add the optional product selector: iterate `options.product ? [options.product] : ['motionClips', 'keyframes']` using the existing guarded code.
4. Add deferred-generator store tests for 20-video clips-first ordering, opening/reopening/closing priority, no preemption/duplicates, independent failures and pause between products. Observe failures before implementation.
5. Select the next eligible product inside the existing pump. Use completeness plus retained product failures, retaining per-video promise/session ownership until both products are terminal. Keep FIFO queue membership through both products, selecting only inactive queued entries; preserve product/cache failure diagnostics across dispatches.
6. Run store/use-case tests until green, then existing ingestion/preview scheduler suites. Do not alter legacy benchmark scheduling.

## Task 2: Player intent and clear product progress

**Files:** `src/presentation/components/VideoCard.vue`, its `.spec.ts`, `src/presentation/stores/videosStore.ts`, `src/presentation/components/utils/IngestionStatusToast.vue`, its `.spec.ts` (create a focused spec only if absent).

1. Add failing component tests: Video/pin opening registers open intent; closing, filtering/unmount release it. A pending seek must not be presented as pending motion when clips already exist.
2. Implement a single watcher over actual mounted/visible player state calling `setVideoPreviewOpen(id, open)`, plus teardown cleanup. Do not use votes as a player-open proxy.
3. Add failing progress tests: clips ready while seeks pending, active generating/persisting stage, product failure, pause/resume, aggregate completion. Keep existing report/session semantics.
4. Implement a derived per-product summary for the current ingestion session and use it in the toast. Expose active product/stage and readable per-card status; retain legacy UI for legacy benchmark injection.
5. Run targeted component/store tests until green; inspect runtime behavior with available browser tooling if feasible without new environment lifecycle.

## Task 3: Regression, review and smoke handoff

**Files:** existing affected specs, `docs/testing/ingestion-clip-ux-smoke.md`, this plan and ignored ledger.

1. Verify pause/removal/reselection, failed product followed by successful other product, explicit retry, completed-product cache failure preservation and stale callback handling. Add missing regression tests before fixes.
2. Run sequentially: `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run build`. Record exact results; failures are not acceptance.
3. Use `requesting-code-review` for read-only independent review of scheduling/contract changes, addressing supported findings with TDD. Re-run affected checks after fixes.
4. Append v2 owner smoke procedure: import 20, verify clips sweep; open A then B to move B's seeks first at the next product boundary; close B to release priority; verify counts/stages and focus recovery. Keep v1 observations and actual-build unknowns intact.
5. Refresh Notion owner feedback and update scoped progress/next action without treating local work as deployed or accepted. Handoff code/test/review evidence and remaining native/preprod acceptance.

## Verification status

Implemented locally on September 7; uncommitted and not published. No migration,
dependency, worker concurrency, clip-quality or benchmark configuration change.

- Task 1: product-specific use-case dispatch; batch clips-before-seeks; newest-open,
  close/reopen, duplicate-open, no-preemption and two-slot/no-same-video overlap
  tests. Existing focus/removal/wipe/retry suites retained.
- Task 2: Video/pin player intent and teardown; clip-ready cards no longer carry
  the orange work ring solely for pending seeks. Separate per-import product
  counts, actual active product/stage, pause/unavailable states. Counts explicitly
  say “This import”; global activity says “Active work across all videos.”
- Task 3: independent review found inactive hydrated-ready promise retirement and
  diagnostic-retention edges. Failing regressions reproduced both; fixes preserve
  active cache writes and ready cache warnings. Inter-product false errors/stale
  completed timing also have a regression. Final read-only review found no
  remaining Important issues.
- Fresh final checks: `npm run lint`, `npm run type-check`, `npm run test:unit`
  (**669/669 across 74 files**), `npm run build`, and `git diff --check` passed.
  Initial full-suite sandbox run had 19 failures from denied loopback listeners
  and a denied `tar` subprocess; the permission-enabled rerun passed without
  changing those tests. Initial lint loop/unused-parameter findings were fixed.
- Added `bvr-motion-keyframes-smoke-v2` SP-01–06 to the smoke document, preserving
  v1 and the owner's corrected observations. Notion retains the earlier Partial
  run; a new published artifact needs its own smoke attempt.
- Final Notion refresh/readback confirms the feature and scoped next actions
  reflect local verification, and the owner Action includes the draft v2 checks.
  No pending synchronization; comments remain inaccessible under existing access.

No running Vite environment was available at inspection, and no new native
browser/media qualification was performed. Real Chrome/Edge and physical
focus-loss acceptance remain open. The toast is still an import-session view,
not a persistent dashboard for all background work; per-card status remains
available after it is dismissed. Speed benchmarking and broader ingestion
optimization remain deferred until master integration.

## Approved release checkpoint — September 7

The owner subsequently requested commit and deployment for smoke testing, and a
standing repository rule to reach a testable preprod before the final handoff.
This supersedes the implementation-only limit above for this release, not the
separate master-promotion or native-acceptance gates.

1. Preserve unrelated primary-checkout changes. Add the bounded smoke-handoff
   policy to the feature's `AGENTS.md` and the primary checkout's existing policy.
   Refresh smoke-plan wording without rewriting historical attempts.
2. Recheck lint, types, unit tests, build and diff; commit only the scoped feature
   changes. Push the branch and require successful trusted push CI for that SHA.
3. Record existing preprod revision/digest/rollback, confirm controller
   compatibility, and dispatch the fixed platform deployment workflow with the
   exact app SHA. Verify runtime identity, HTTPS/readiness and available browser
   smoke in an isolated test profile; preserve browser data and rollback.
4. Publish a new v2 Notion Action/Test Run for this artifact, retaining the older
   Partial attempt. Record release/browser evidence separately from unperformed
   owner/native qualification. Handoff the ready URL and focused owner checks.

The ignored release ledger records the actual commit, CI/deployment runs,
runtime identity, smoke results and synchronization status. No master merge,
production release, destructive cleanup or speed benchmark is included.
