# Seek Backend Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare production-recipe DOM and Mediabunny seek extraction on selected files or recursive folders, with useful filename-free failure reports.

**Architecture:** Extend the existing lab and plan runner. Reuse native directory selection, shared file filtering, DOM media primitives and the existing worker client. Keep production timeline acceptance, ingestion, storage and defaults unchanged.

**Tech Stack:** Vue 3, TypeScript, Vitest, Cypress, pinned Mediabunny 1.55.7.

---

### Task 1: Recursive folder selection and local mapping

Files: `src/benchmark/CustomExtractionBenchmark.vue`, its `.spec.ts`, optionally the pipeline view for consistent custom folder inputs.

1. Test a folder input with nested duplicate basenames, accepted MP4s and ignored sidecars; selected ordinals remain distinct. Test active-run selection protection, cancel/no-files behavior and private mapping hidden by default.
2. Run `npm exec -- vitest run src/benchmark/CustomExtractionBenchmark.spec.ts --exclude '.worktrees/**'`; verify new assertions fail.
3. Add a native `type=file multiple webkitdirectory` input, shared `isBrowserPlayableVideoFile` filtering for folders, explicit ignored count and private mapping toggle. Keep file-input diagnostic compatibility and JSON redaction.
4. Repeat tests, inspect diff. Stage only scoped files for the feature commit after review.

### Task 2: Matched DOM seek extraction and bounded runner

Files: `src/infrastructure/video/benchmark/domPreviewExtraction.ts`, its `.spec.ts`, `src/benchmark/runKeyframeBenchmark.ts`, its `.spec.ts`.

1. Test `extractKeyframesWithDom(file, duration, signal, 160)` for exact `keyframeTargets`, no upscale, JPEG/output limits, cancellation and cleanup. Test DOM null read counters.
2. Run those two specs and confirm missing behavior fails.
3. Reuse `prepareKeyframes`, `seekToTime`, `capturePreviewFrame` with 160 px/0.72. Factor only an actually shared capture loop if needed. Extend keyframe options with `execution: 'dom'|'mediabunny'` and `jobs: 1|2`, defaulting existing callers to Mediabunny/one. Use a bounded per-file scheduler and common deadline including metadata; preserve file order, actual peak, terminal status and fixed sample selection.
4. Test two active jobs, no dispatch after cancellation, deadline failure (not false whole-plan abort), ordered results and no sample substitution. Run focused tests green.

### Task 3: Preset and comparison UI

Files: `src/benchmark/extractionPlans.ts`, `runExtractionBenchmark.ts`, `runExtractionPlan.spec.ts`, `ExtractionPlanPanel.vue`, `ExtractionPlanPanel.spec.ts`.

1. Test `seek-backends-v1` produces eight steps: Mediabunny/DOM x one/two jobs then reversed order, all at160 px. Assert one shared lock and at most two first-file sample arrays, published only after timing.
2. Run runner/component specs, observe failures.
3. Route execution/jobs to the keyframe runner. Add a concise preset label and accurate help, per-file wall times and backend-labeled fixed-source tooltips. Preserve current quality comparisons and export status.
4. Re-run those specs, including stop/hidden cases.

### Task 4: Preserve useful failure diagnostics

Files: `src/infrastructure/video/extraction/playerTimeline.ts`, `workerDiagnostics.ts`, `clipExtraction.worker.ts`, `previewExtraction.worker.ts`, `src/application/ports/IVideoPreviewGenerator.ts`, `src/benchmark/runClipBenchmark.ts`, `runKeyframeBenchmark.ts` and their existing relevant specs.

1. Test allowlisted failure evidence survives failed benchmark rows but names/paths/raw exceptions do not. Test separate timeline rejection categories for unsupported edits, invalid values, leading gap and short track; rejection behavior stays identical.
2. Run focused specs red.
3. Return bounded failure diagnostics even without per-frame progress subscriptions; copy only safe diagnostic fields into rows. Add enum-only timeline reason/time resolution to existing evidence. Do not add frame progress traffic to timed benchmarks or lift limits/timeline validation.
4. Run focused tests green and inspect privacy boundaries.

### Task 5: Verification and smoke handoff

Files: `docs/testing/custom-mediabunny-benchmark.md`, relevant `cypress/e2e/customExtraction.cy.ts` / `extractionPlan.cy.ts` if needed.

1. Document preset, folder filtering/private mapping, scope vs full ingestion, failed-result interpretation, and normal-app report vs private audit.
2. Run `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run build` one heavyweight command at a time. Add/run isolated real-media browser smoke as available; never access operator DBs.
3. Use requesting-code-review for independent read-only review of contracts/privacy/lifecycle. Fix findings test-first.
4. Commit bounded files, push feature, require trusted successful CI for exact SHA, deploy immutable image on existing preprod when authorized by active repo workflow. Verify readiness/identity/HTTPS and available browser smoke; no master integration or data cleanup.
5. Refresh Notion feedback; retain separate failed owner attempts and open native timeline gate. Handoff exact tested/deployed build, folder/seek test steps and remaining restrictions.
