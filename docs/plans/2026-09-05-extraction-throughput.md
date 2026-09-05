# Extraction throughput diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Explain the custom-file order effect with stage evidence and test standalone DOM/Mediabunny throughput at one or two concurrent files.

**Architecture:** Extend only the extraction benchmark. Reuse existing adapters and shared lock/cancellation; no production ingestion/default changes or dependency upgrades. Export version 2 of the extraction report, retaining its mode identifier and minimized metadata boundary.

**Tech Stack:** Vue, TypeScript, Vitest, Cypress, pinned Mediabunny 1.55.7 and browser WebCodecs.

## Investigation and design

The owner's same-selection four repetitions all passed. DOM/MB totals in seconds: (19.3142,20.1836), (10.3484,39.7693), (19.5297,19.9850), (10.3616,39.5246). Backend-first order alternates. Per-file read counts/bytes stay constant. These results establish order correlation, not the cause. All successful candidate files passed the MP4/AVC gate; codec/container diversity was not tested.

Source inspection: per-row timing wraps awaited adapter calls, DOM finally disposes its element before return; the worker posts success before finally disposing Input, allowing the host to terminate first. Move worker disposal before publication and include its elapsed time. UI currently creates sample image URLs between timed jobs, so image decoding can overlap later trials even though callback time is excluded. Retain only the last file's outputs and publish samples after all measured jobs; progress text may still render during trials.

Alternatives: repeating the same paired test provides little new evidence; immediately increasing concurrency leaves order ambiguity unresolved. Chosen approach exposes paired serial, DOM-only and Mediabunny-only modes with standalone 1/2-job selection, plus stage metrics. No automatic matrix or file-type export is needed yet. Existing accepted best-effort memory limits remain; two jobs may double memory pressure.

## Task 1: Test-first diagnostic contract and adapters

Files: src/infrastructure/video/benchmark/previewExtraction.ts, previewExtraction.spec.ts, domPreviewExtraction.ts, previewExtraction.worker.ts, previewWorkerClient.ts, previewWorkerClient.spec.ts; new domPreviewExtraction.spec.ts and previewExtraction.worker.spec.ts.

1. Add failing tests for strict allowlisted finite nonnegative stage metrics, DOM cleanup and stage timing, worker disposal-before-reply (success/error), and worker startup overhead.
2. Run `npx vitest run src/infrastructure/video/benchmark --exclude '.worktrees/**'`; observe expected missing behavior failures.
3. Add `ExtractionMetrics` with setupMs, extractionMs, encodeMs, cleanupMs, totalMs, readMs/readMaxMs (null DOM), workerOverheadMs (null DOM). Worker overhead is host elapsed minus worker total, not a precise CPU/startup measurement. Extraction includes nested I/O and drawing; encode excludes frame retrieval, read totals can overlap other stages. Never sum nested stages as independent wall time.
4. Measure DOM via existing capture timing observer and timed seeks; worker via explicit iterator.next and timed source callback/convertToBlob. Dispose input before sending any reply. Validate and reconstruct metrics to exclude arbitrary properties.
5. Rerun focused tests; preserve errors, resource cleanup and original read guards.

## Task 2: Test-first scheduling and comparison UI

Files: src/benchmark/runExtractionBenchmark.ts, runExtractionBenchmark.spec.ts, CustomExtractionBenchmark.vue, CustomExtractionBenchmark.spec.ts, cypress/e2e/customExtraction.cy.ts.

1. Add failing tests: standalone backend only; max two active jobs; no next repetition before settlement; launch-order row IDs despite out-of-order completion; abort stops queued work and settles active jobs; paired jobs=2 rejected; samples emitted only after timed work; real batch wall time not sum of overlapping row durations.
2. Run targeted Vitest to observe failures.
3. Add options `execution: 'paired' | 'dom' | 'mediabunny'`, `jobs: 1 | 2` (defaults paired/1). Paired keeps file/method ordering. Standalone runs bounded consumers over file indexes and records per-repetition backend batch elapsedMs, peakActiveJobs and counts. Row order is launch order; expose startedAtMs/finishedAtMs relative to run for overlap proof, not wall-clock identity.
4. Keep `onRow` numeric-only; publish last-file sample outputs after all jobs settle through `onSamples`. Retain at most one pair of outputs; never collect all Blob outputs. Catch observer errors without losing rows. UI revokes old URLs as before.
5. Add selectors, batch totals, explanation of concurrency/shared hardware and privacy; paired forces 1. Keep old result settings attached to their report. No filename/codec/resolution/target metadata added.
6. Rerun targeted tests and update browser smoke for standalone two jobs, batch counts/peak and numeric metrics, cancellation, privacy and visual sample cleanup.

## Task 3: Evidence, review and normal preprod handoff

Files: docs/testing/custom-mediabunny-benchmark.md and this plan.

1. Document owner results, metric nesting, post-run samples, standalone 1/2 controls, failures and native test sequence. No speedup claim.
2. Run targeted tests, lint, type-check, complete unit suite, build; one heavyweight command at a time. Reuse existing task browser container after label/mount verification; no lifecycle delegation or destructive cleanup.
3. Request independent read-only review of contracts/scheduling/cancellation/timing; address findings test-first.
4. Commit feature, push exact SHA; await exact push CI/scanning. Use existing runbook to deploy immutable SHA to current preprod without merge/squash. Verify live build and Chrome/Edge synthetic smoke.
5. Ask owner for standalone one-job results first, then two-job results using same retained selection. These are extraction throughput, not full-pipeline performance. Keep native visual acceptance open.
