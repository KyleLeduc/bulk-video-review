# Preview recovery and clip UX implementation plan

> Execution skill: executing-plans. Follow test-driven-development for each batch.

**Goal:** Recover normal preview extraction after focus loss and deliver a concise
clip-quality smoke workflow without requiring more speed evidence.

**Architecture:** Existing Pinia scheduler owns preview cancellation/requeue;
presentation owns browser lifecycle; application preview policy owns completeness.
Mediabunny remains inside the existing isolated benchmark worker contract.

**Stack:** Vue/Pinia, TypeScript, Vitest, Cypress, Mediabunny 1.55.7/WebCodecs.

## 1. Preview recovery (red, green, review)

- Add failing regressions in `UpdateVideoThumbnailsUseCase.spec.ts` and
  `videosStore.previewScheduler.spec.ts` for 2–8 frames, pause/requeue, stale
  results, repeated resume/removal and cached reimport.
- Add browser lifecycle regression in `App.spec.ts` (normal App only), and
  paused toast coverage in the native `previewFocusRecovery.cy.ts` smoke.
- Add the shared completeness policy in `src/application/services`, use it in
  `UpdateVideoThumbnailsUseCase.ts`, `videosStore.ts`, and `VideoCard.vue`.
- Reuse the scheduler's resumable interruption marker; add explicit pause state
  and normal App lifecycle wiring. Keep nine-frame diagnostic totals. Preserve
  the existing persistence transaction and old previews on incomplete output.
- Run targeted Vitest checks; update successful fixture counts where they encoded
  the old two-frame assumption. Do not change display-only two-frame behavior.

## 2. Clip quality and playback (red, green, review)

- Extend `runExtractionPlan.spec.ts`, clip worker/client
  tests and `ExtractionPlanPanel.spec.ts` before behavior changes.
- Add validated frame rates in `clipExtraction.ts`; propagate through
  `extractionPlans.ts`, `runClipBenchmark.ts`, `clipWorkerClient.ts` and
  `clipExtraction.worker.ts`. Preserve the old preset and default.
- Retain at most four step-labeled samples in `runExtractionBenchmark.ts`;
  never serialize blobs. Implement a single cycling, noninteractive video in
  `ExtractionPlanPanel.vue`, external accessible playback/variant controls,
  autoplay failure reporting and URL/media cleanup.

## 3. Benchmark organization

- Add component assertions for shared-input/manual-setting independence.
- Reorder `CustomExtractionBenchmark.vue` into shared inputs, automatic plan,
  collapsed manual comparison; concise copy with limit/privacy disclosures.
- Update `cypress/e2e/extractionPlan.cy.ts` for FPS quality runs, single-player
  autoplay, no controls, advance/wrap, and cleanup.
- Update `docs/backlog.md` and the smoke checklist with implemented versus
  owner-acceptance state; speed work explicitly deferred until master.

## 4. Verification and handoff

- Run targeted tests first: `npx vitest run <changed specs> --exclude '.worktrees/**'`.
- Sequentially run `npm run test:unit`, `npm run lint`, `npm run type-check`,
  `npm run build` (one heavyweight command at a time).
- Request independent read-only code review; resolve important findings with
  regression coverage. Re-run affected checks.
- Inspect/reuse the existing browser container, then run focused native Chrome
  and Edge smoke checks. Never provision a per-agent container.
- Report branch/checks and remaining Windows focus/visual acceptance. Master
  integration and publication are separate from this implementation checkpoint.
