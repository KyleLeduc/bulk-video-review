# Buffered Extraction Reader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare unchanged direct File slice reads with a bounded 1 MiB buffer in the custom Mediabunny experiment.

**Architecture:** Keep the adapter in infrastructure/video/benchmark. A testable reader owns range guards, actual I/O accounting and a single read-ahead window; worker still owns lifecycle and cancellation. Thread an allowlisted reader choice through UI, runner and worker, recording it in extraction schema 3 without changing full-pipeline protocol or production wiring.

**Tech Stack:** TypeScript, Vue, Vitest, Cypress, pinned Mediabunny 1.55.7.

## Design and tradeoffs

Approved continuation is a bounded read-buffer A/B experiment, not a proven performance fix. Baseline direct reads stay default. Alternative built-in prefetch changes scheduling; FileReaderSync changes the API under test. Use a 1 MiB forward window beginning at a cache miss, clamped at EOF. Larger valid requests read exactly their requested range without caching. Cache hits return copies, so library-held small arrays do not retain a full window. Serialize buffered requests to bound in-flight reader allocations and share a loaded window safely; direct requests retain their existing async behavior. Count actual slice calls/bytes/time, including unused read-ahead. Existing 16 MiB single read and 256 MiB cumulative limits apply before allocation; invalid ranges fail before I/O. No library cache, codec, targets, encoder or concurrency changes.

## Task 1: Reader safety and accounting

Create `src/infrastructure/video/benchmark/benchmarkFileReader.ts` and `.spec.ts`.

1. Write tests for direct exact reads, adjacent buffered reuse, byte equality, returned buffer isolation, EOF, large uncached requests, invalid ranges, cumulative reservation and failed reads. Concurrent buffered requests must share the first window and recover after errors without hiding rejection.
2. Run `npx vitest run src/infrastructure/video/benchmark/benchmarkFileReader.spec.ts --exclude '.worktrees/**'`; confirm missing-reader RED.
3. Implement `createBenchmarkFileReader(file, mode, metrics)` with `read`, `readBytes`, `readCalls`; physical reads update supplied read metrics in finally. Buffered mode uses a promise tail and one window; account failed reads conservatively.
4. Rerun targeted test GREEN.

## Task 2: Choice propagation and native smoke

Modify `previewExtraction.worker.ts`, `previewWorkerClient.ts`, `previewWorkerClient.spec.ts`, `previewExtraction.worker.spec.ts`, `src/benchmark/runExtractionBenchmark.ts`, `.spec.ts`, `CustomExtractionBenchmark.vue`, `.spec.ts`, and `cypress/e2e/customExtraction.cy.ts`.

1. Add failing tests for allowlisted reader forwarding/default, invalid choices before preparation, exported schema 3 reader selection, and UI selection.
2. Preserve default `direct`; offer `buffered-1mib`. DOM-only report reader is null, and buffered choice is disabled there. Worker validates choice before reading and obtains counters from the reader. Do not add private fields.
3. Run focused tests GREEN and app/Cypress type checking. Synthetic browser smoke runs both reader modes at two jobs and checks successful frames, stage metrics and selected reader identity, plus normal app/cancellation checks.

## Task 3: Documentation, review and delivery

Update `docs/testing/custom-mediabunny-benchmark.md` with native baseline table, schema 3 counter semantics, buffer/copy tradeoffs and same-selection direct/buffered 1-job instructions. Read-only independent code review under requesting-code-review. Run lint, targeted/full unit tests, build, Chrome/Edge smoke serially. Commit scoped changes, push and await exact CI/image scan, deploy through existing immutable preprod controller, verify revision/digest/HTTPS and live Chrome/Edge. Preserve branch/worktree and resources for continuing benchmark work; no merge, pruning or volumes. Native performance remains owner follow-up.
