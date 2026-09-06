# Clip duration and benchmark tabs implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare 0.5, 1, 1.5 and 2-second clips at the owner's selected 20 FPS, split manual configuration from the runner, and deploy a smoke checkpoint.

**Architecture:** Extend the existing benchmark-only clip options across plan, report, worker client and worker. Keep existing 3-second/FPS presets reproducible. Keep both tab panels mounted, disable switching during extraction, and pause playback while its panel is hidden. No normal-ingestion, persistence, DI or production-adapter changes.

**Tech Stack:** Vue, TypeScript, Mediabunny 1.55.7, WebCodecs, Vitest, Cypress and existing immutable preprod deployment.

## Design and tradeoffs

- Use a versioned `clips-duration-v1` preset rather than silently changing old presets or adding a manual duration matrix. It becomes the runner default; the older FPS comparison remains available.
- All four durations use 20 FPS, 320 px, 250 kbit/s, one worker/file, existing read/output/time limits and the same source starts/count. Retain the three-second sampling grid for short inputs too, so duration is the only changed variable; clip ends clamp to source length.
- Add a validated `ClipSeconds` union (0.5/1/1.5/2/3). Carry `clipSeconds` through plan JSON, nested report, worker message and trim; validate returned clip lengths against the requested value. Keep 3 seconds/10 FPS as legacy defaults.
- Shared file selection and memory acknowledgement sit above two accessible tabs: Test runner (default) and Manual config. Use `v-show` rather than unmounting and losing results. Arrow/Home/End navigation follows the selected tab; controls stay visible throughout an active run because tab switching is disabled.
- Hidden-panel preview playback stops and cannot restart from queued media events. Returning preserves explicit user pause/reduced-motion preference. Variant labels show both duration and FPS.
- Benchmark hiding intentionally aborts and retains partial JSON; it does not resume. Normal app focus recovery is a separate smoke test. Clarify this in concise UI copy; no speculative scheduler fix.

## Task 1: Duration transport and validation

Files: `src/infrastructure/video/benchmark/clipExtraction{,.worker,.worker.spec,.spec}.ts`, `clipWorkerClient{,.spec}.ts`, `src/benchmark/extractionPlans.ts`, `runClipBenchmark.ts`, `runExtractionBenchmark.ts`, `runExtractionPlan.spec.ts`.

1. Add failing tests for four durations at fixed 20 FPS, unchanged sampling starts/count, short-source clamp, invalid duration rejection, worker trim and oversized response rejection.
2. Run `npx vitest run src/benchmark/runExtractionPlan.spec.ts src/infrastructure/video/benchmark/clipExtraction.spec.ts src/infrastructure/video/benchmark/clipExtraction.worker.spec.ts src/infrastructure/video/benchmark/clipWorkerClient.spec.ts --exclude '.worktrees/**'`; verify failures match absent duration support.
3. Implement the typed option and new preset. Use `clipWindows(duration, clipSeconds = CLIP_SECONDS)` and `validateClipOutput(value, clipSeconds = CLIP_SECONDS)`; pass the validated option through every boundary without changing old defaults.
4. Rerun the same tests; require green.

## Task 2: Tabs and duration preview UX

Files: `src/benchmark/CustomExtractionBenchmark{,.spec}.vue/ts` and `ExtractionPlanPanel{,.spec}.vue/ts` (existing `.vue` components and `.spec.ts` tests), `cypress/e2e/{customExtraction,extractionPlan}.cy.ts`.

1. Add failing tests for runner default, separate tab visibility/ARIA/keyboard navigation, manual settings retained on switch, tabs locked during runs, duration labels and hidden-panel playback guard.
2. Run `npx vitest run src/benchmark/CustomExtractionBenchmark.spec.ts src/benchmark/ExtractionPlanPanel.spec.ts --exclude '.worktrees/**'` and verify intended failures.
3. Replace manual disclosure with tab panels and reuse existing settings/results. Pass panel visibility into the runner; gate play/ended/autoplay and preserve pause state. Label duration variants and keep copy concise.
4. Rerun focused tests. Update Cypress to select Manual config and exercise all four real encoded durations, one-player cycling, tab retention and playback pause.

## Task 3: Verification and release

1. Run `npm run test:unit`, `npm run lint`, `npm run build`, targeted Cypress and `git diff --check`, one heavy command at a time.
2. Independent read-only review against this plan, especially fractional duration boundaries and video lifetime. Resolve important findings and retest.
3. Update `docs/testing/ingestion-clip-ux-smoke.md` with 20 FPS choice, duration/tab steps, intentional benchmark interruption, fresh evidence and remaining physical Windows acceptance.
4. Commit scoped feature changes, push `feat/video-benchmark-view`, wait for successful trusted exact-SHA push CI/image scan/runtime smoke.
5. Reverify published platform workflow and installed release contract; capture current rollback state, deploy immutable SHA through fixed controller, verify running digest/build identity, trusted HTTPS and benchmark access. Master and unrelated work remain untouched.
