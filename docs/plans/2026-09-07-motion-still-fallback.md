# Motion preview still fallback implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After terminal motion-clip extraction failure, supply the existing nine-image DOM slideshow; retain the cover if both paths fail.

**Architecture:** Keep fallback inside the existing motion job and AbortSignal ownership. Reuse `IVideoThumbnailGenerator` / `VideoThumbnailGeneratorAdapter`, but persist the resulting complete fallback in the existing disposable, epoch-guarded preview cache, not through metadata-writing legacy orchestration. An optional DTO fallback product contains its recipe version, nine frames and sanitized original motion failure; it is distinct from successful clips and granular keyframes. No new scheduler, dependency or metadata migration.

**Tech Stack:** TypeScript, Vue/Pinia, Vitest, IndexedDB, existing DOM media extraction, Cypress Chrome/Edge, immutable preprod delivery.

## Approved design and boundaries

- Owner approved motion clips → nine-image slideshow → cover only on 2026-09-07.
- Only terminal clip extraction failure triggers fallback. Pending work, focus cancellation, source replacement/removal and cache epoch invalidation do not.
- Reuse a valid existing nine-frame Blob set after a failed clip attempt; otherwise generate with the existing DOM adapter. Never treat arbitrary/partial cached stills as valid fallback.
- Keep successful clips preferred; cache fallback with the motion recipe so reload/reselection avoids repeated failed motion work. Future recipe changes invalidate fallback normally.
- Preserve original failure diagnostics and distinguish `fallback` from `ready` in per-product reporting. Seek generation remains independent and newest-open priority still acts at job boundaries.
- Slideshow runs only while hovered, visible, focused and on screen; stop on leave, player open, unmount or reduced motion. Revoke only owned object URLs. Cover remains underneath and handles failed image display.
- Keep master, production, operator browser data, unrelated primary edits and rollback release unchanged. Four owner file failures remain undiagnosed; fallback is resilience, not a claimed root-cause fix.

## Task 1 — Complete fallback product and cache (red, then green)

Files: `src/domain/entities/ParsedVideo.ts`, `src/domain/repositories/IVideoPreviewCacheRepository.ts`, `src/domain/services/videoPreviewPolicy.ts` and `.spec.ts`, `src/infrastructure/repository/VideoPreviewCacheRepository.ts` and `.spec.ts`.

1. Add failing tests: complete nine-frame fallback accepted; partial, invalid dimensions/Blob/times, wrong version or unsanitized failure reason rejected; real cache hydration round-trip and invalidation preserve independent clips/seeks.
2. Run `npx --no-install vitest run src/domain/services/videoPreviewPolicy.spec.ts src/infrastructure/repository/VideoPreviewCacheRepository.spec.ts --exclude '.worktrees/**'`; verify missing-fallback failures.
3. Add optional `motionFallback` DTO and cached product variant (`kind`, `version`, `items`, `reason`). Add `hasCompleteMotionFallback` and `hasUsableMotionPreview` without weakening `hasCompleteMotionClips`. Extend cache reads/validation/accounting without changing the database version or authoritative metadata.
4. Rerun targeted tests; commit cohesive product contract/tests after green.

## Task 2 — Same-job DOM fallback and queue integration (red, then green)

Files: `src/application/usecases/UpdateVideoPreviewsUseCase.ts` and `.spec.ts`, `src/infrastructure/di/createVideoServices.ts`, `src/application/usecases/LinearVideoIngestionUseCase.ts`, `src/application/services/previewCompleteness.ts`, `src/presentation/stores/videosStore.ts`, `src/presentation/stores/videosStore.motionPreviews.spec.ts`; update typed test setups as needed.

1. Test failed motion → complete fallback → seeks; valid existing still reuse; double failure → cover without queue strand; no DOM calls on motion success or cancellation; stale source/wipe/removal; fallback cache failure retains live result; reload skips satisfied fallback; current metadata/votes survive; priority and focus remain correct.
2. Run the relevant test paths; verify expected red assertions before implementation.
3. Inject the existing thumbnail generator into enrichment. On terminal motion failure, generate/validate/publish/cache fallback within the same owned attempt. Keep a separate job-kind union for motion/seeks; fallback is not another queue lane. Add fallback progress stage and retained original error. Merge/hydrate the optional DTO result at current-video boundaries; count fallback separately and include bytes in diagnostics.
4. Run use-case/store/ingestion/DI tests and fix only scoped regressions. Commit cohesive implementation after green.

## Task 3 — Slideshow and honest progress UI (red, then green)

Files: `src/presentation/components/MotionPreview.vue` and `.spec.ts`, `src/presentation/components/VideoCard.vue` and `.spec.ts`, `src/presentation/components/utils/IngestionStatusToast.vue` and `.spec.ts`.

1. Test motion precedence; fallback cycles nine stills and wraps; no controls/interactivity; stop/reset on inactive/focus/offscreen/reduced-motion/unmount; partial/double-failed products keep cover; card and toast show still-ready/fallback-generating counts without claiming clip success.
2. Run targeted component tests and confirm red.
3. Extend the existing preview display's shared visibility/resource lifecycle for stills (no duplicated visibility controller). Feed only validated fallback; keep seek frames separate. Update labels/counts.
4. Rerun relevant tests; commit after green.

## Task 4 — Review, smoke procedure, delivery

Files: `docs/testing/ingestion-clip-ux-smoke.md`, `docs/backlog.md`, scoped Cypress specs if useful.

1. Revise current smoke procedure for fallback and append owner finding; preserve historical attempts. Cover success, repeated four failures, pause during fallback, opened-video priority, reload/cache reuse, double failure and reduced motion.
2. Run lint, type-check, full unit suite and production build serially. Use requesting-code-review for independent read-only contract/lifecycle review; resolve findings with regression evidence.
3. Publish feature commits, require trusted exact-SHA CI, deploy immutable image to existing preprod through the current runbook, verify served identity/readiness/HTTPS and isolated automated Chrome/Edge fallback and overlap smoke.
4. Update Notion with source/implementation evidence; retain failed previous attempt and create new build-specific smoke Action/Test Run with actual tested metadata blank. Hand off URL, exact SHA, focused owner tests and remaining acceptance; do not merge master.

## Verification ledger

- Baseline 2026-09-07: enrichment/store targeted tests 27/27 pass on 4871bad.
- Implementation red/green, review, CI/deployment and browser evidence: pending; recorded in ignored task ledger as work proceeds.
