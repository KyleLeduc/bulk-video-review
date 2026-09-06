# Preview density and ingestion adapters

> **For implementation:** use the executing-plans skill, with test-first changes and an independent read-only review.

**Goal:** Measure whether Mediabunny can match DOM for dense still previews or larger concurrent batches before choosing ingestion routing; retain a separate path toward background motion previews.

**Architecture:** Extend only the existing experimental extraction runner, DOM adapter, disposable worker and benchmark controls. Reuse the scheduler and reader. Normal ingestion, domain models, persistence, DI and gallery remain unchanged. Future adapters belong behind existing application ports, with one shared ingestion workflow.

**Tech stack:** Vue, TypeScript, Vitest, Cypress, browser DOM/WebCodecs, pinned Mediabunny 1.55.7.

## Approved direction and gates

1. **This implementation:** comparable still workloads, 9 or 100 previews per file, 1/2/4 concurrent files for either standalone backend. Paired mode stays serial. Native timings decide whether more concurrency or routing is worth pursuing.
2. **Later experiment:** separately measure metadata+poster ingestion and ten five-second, muted looping video clips positioned across the duration. MP4/WebM motion previews are distinct from literal GIF encoding. Duration-aware still density is a product policy, not inferred from these two benchmark counts.
3. **Later integration:** only after workload-specific evidence, add the useful adapter behind existing ports. Do not route by file size or list length alone; duration, codec, resolution, seek pattern, device capability and contention matter. Retain stills until background enrichment succeeds; do not duplicate identification/persistence/retry workflows.

## Measurement and safety decisions

- Nine targets preserve the existing integer-second deciles. One hundred targets use `duration * i / 101`, i=1..100: equal fractional positions, not a guarantee of 100 distinct decoded source frames.
- Report schema 4 records requested count, sampling policy, cumulative read budget and JPEG output budget. Metadata preparation stays outside batch timing; samples remain after-run/latest-file only.
- Preserve 256 MiB cumulative actual reads for nine previews; explicitly allocate 1 GiB for 100 previews. Both readers enforce the same count-specific budget before I/O. Output remains 16 MiB, individual reads 16 MiB, source cache 8 MiB, worker window up to 1 MiB, deadline 120s. Limits are not browser/native memory caps. Four jobs increase resource pressure; no automatic retry or eight-job mode.
- Compare complete batches at identical count/jobs/settings/build/selection in both run orders; report failures rather than discarding them. Separate per-file latency from elapsed batch throughput. Native performance is not inferred from synthetic smoke tests.

## Task 1 — Policy and adapter contracts (RED/GREEN)

Files: `src/infrastructure/video/benchmark/previewExtraction{,.spec}.ts`, `domPreviewExtraction{,.spec}.ts`, `benchmarkFileReader{,.spec}.ts`, `previewExtraction.worker{,.spec}.ts`.

1. Add failing tests for fractional 100-target preparation, unchanged nine targets, rejection of unsupported counts, count-aware output validation, dense read budget reservation, and actual adapter iteration over 100 prepared targets.
2. Run those targeted specs and verify missing behavior causes failures.
3. Add the minimal count type/validation and read-budget policy. Thread count through preparation and infer it from validated prepared targets at adapter/reader boundaries. Preserve defaults.
4. Run the same specs to green; retain cleanup and malformed-output guards.

## Task 2 — Runner and UI (RED/GREEN)

Files: `src/benchmark/runExtractionBenchmark{,.spec}.ts`, `CustomExtractionBenchmark.vue`, `CustomExtractionBenchmark.spec.ts`.

1. Add failing tests for both standalone backends at four bounded jobs, dense preparation/output/report settings, unsupported counts/jobs, and four-job cancellation without draining the queued files. Extend UI tests for selecting and forwarding count/jobs.
2. Run targeted tests and verify expected failures.
3. Extend existing settings and controls, schema 4, and freeze the displayed requested count to the active/completed run. Keep paired serial, defaults unchanged, controls disabled while active.
4. Verify dense output retention remains latest-file only and settings changes cannot relabel prior rows.

## Task 3 — Evidence, browser acceptance and handoff

Files: `cypress/e2e/customExtraction.cy.ts`, `docs/testing/custom-mediabunny-benchmark.md`.

1. Retain nine-frame/two-job smoke; add real 100-frame/four-job DOM and both reader runs over synthetic files, report/batch assertions, cancellation and decoded-image checks.
2. Record the owner's successful visual check and schema-3 forward/reverse reader runs plus buffered two-job results. Update operator instructions for the new controlled matrix.
3. Read-only independent review of the diff, fix substantive findings test-first.
4. Serial verification: targeted tests, lint, app/E2E type checks, full unit suite, build, existing-container Chrome/Edge smoke. No new dependencies or containers.
5. Handoff with exact checks and remaining native matrix. Deployment/integration must use the established approved workflow and immutable identity; do not merge or clean up the feature worktree as part of this experiment.

## Owner evidence motivating this phase

Schema 3, build 594ab59, 20 files, two repetitions per run:

| Run order / mode | Batch times (seconds) | Mean |
|---|---|---:|
| Direct first, 1 job | 40.5386 / 40.3169 | 40.42775 |
| Buffered second, 1 job | 29.7849 / 28.0795 | 28.93220 |
| Buffered first, 1 job | 27.6338 / 28.0079 | 27.82085 |
| Direct second, 1 job | 40.7993 / 40.0721 | 40.43570 |
| Buffered, 2 jobs | 16.7387 / 17.0177 | 16.87820 |

All these batches completed; the owner says previews looked good. Buffering reduces the combined one-job mean by 29.8%, with 18,957 → 886 actual reads but 448,283,124 → 941,658,548 bytes per repetition. Two buffered jobs give 1.65x throughput against the preceding one-job buffered mean. Older DOM two-job mean was 9.7681s on a different build/cache history; no crossover is established. Matching output byte counts are not pixel equivalence.

## Local implementation checkpoint — 2026-09-06 UTC

Tasks 1–3 are implemented and locally verified. Test-first changes observed the expected failures before implementation. Independent review identified a missing DOM null-metric invariant; five regressions reproduced it and the report boundary now rejects fabricated DOM read/worker evidence. Re-review has no remaining findings.

Final checks: 477/477 unit tests across 58 files; lint (zero warnings), app and Cypress type checks, production build and diff check. Existing-container Chrome 152 and Edge 152 each passed both extraction and normal-app smoke specs, including real four-job/100-frame DOM, direct and buffered extraction. The browser container's external network remains disconnected. No dependency, production ingestion, persistence or deployed-service changes were made.

Publication to preprod is a separate pending owner choice. Native 100-preview/four-job performance, memory/responsiveness acceptance, crossover routing and background clips remain unverified or future scope.
