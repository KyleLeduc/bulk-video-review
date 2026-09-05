# Custom-file Mediabunny Extraction Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the owner select local files on `/benchmark` and compare DOM versus Mediabunny preview extraction without downloading fixtures.

**Architecture:** A separate extraction-only mode in the existing benchmark page owns a local file selection and serial comparison runner. The DOM path reuses existing thumbnail utilities; a disposable module worker uses unchanged Mediabunny 1.55.7. Neither path imports production DI, persists results to the catalog or changes pipeline protocol v2.

**Tech Stack:** Existing Vue/TypeScript/Vite/Vitest/Cypress plus exact `mediabunny@1.55.7`; File, WebCodecs and OffscreenCanvas. No alternative demuxer or WASM.

## Approved scope revision

On 2026-09-05 the owner explicitly chose custom files after discussing memory risks. This supersedes the earlier stop requirement for this **experimental extraction comparison only**. Do not claim a hard parser/native memory ceiling or untrusted-file robustness. Keep the source audit intact. No library fork or parser preflight is needed for this accepted experiment.

Choose extraction comparison over full-pipeline integration now: it directly tests the seeking hypothesis with substantially fewer changes. UI/report must state that its timings exclude ingestion, persistence and gallery work and are not comparable to the previous 9.45-second pipeline figure. Normal app and existing pipeline benchmark remain unchanged. Unsupported candidate files fail visibly; no silent DOM fallback.

One file/backend job at a time; alternate backend order per repetition; 1–5 repetitions. Both use nine DOM-derived target timestamps, 480-pixel maximum width/no upscale and JPEG quality .72. A shared metadata preparation step determines targets outside extraction timing and is reported separately. Fresh worker/media element per job; no application result cache; shared browser/OS caches remain. Display a bounded set of sample images, retain numeric results only, and preserve every failed/hidden/aborted row. User can stop; page hiding aborts the comparison as invalid.

File bytes stay local. Export only selection identity/ordinal (not name/path/content hash), exact sizes as already disclosed, build/browser identity, backend/order/status and aggregate timings/output/read counts. No raw exceptions, encoded images, per-frame PTS/duration/codec metadata or paths in copied JSON. Show candidate/DOM images locally for human acceptance. Best-effort read/output and decoded-dimension limits remain, explicitly not pre-allocation guarantees. Worker gets a 120-second deadline and is terminated on cancellation, error and completion; this is a lifetime bound, not memory admission.

## Task 1 — Isolate and pin the approved dependency

Inspect and preserve the existing shared `node_modules` symlink; make a deliberate private feature-worktree install. Modify only feature `package.json`/lock to pin `mediabunny: "1.55.7"`. Use `npm install --package-lock-only --ignore-scripts` then `npm ci --ignore-scripts` with network approval. Retain package/source/license notices in the built artifact; add build-time source/notice packaging with tests, using installed exact source rather than network downloads at build time. Do not alter shared target or upgrade other dependencies.

## Task 2 — Extraction worker and lifecycle (TDD)

Create `src/infrastructure/video/benchmark/previewExtraction.ts`, `previewExtraction.worker.ts`, `previewWorkerClient.ts` and focused specs. Tests first: fixed target/dimension policy, supported output validation, single active job ownership, worker startup/errors/malformed results, cancellation/deadline termination, no transfer of File, late replies, bounded output and private-error redaction. Run focused Vitest red, then minimal implementation to green.

Worker accepts original File plus prepared targets/dimensions. MP4/H.264 and worker capability checks; `CustomSource` with no prefetch and 8 MiB cache, callback read size/cumulative limits described as best effort only; CanvasSink sequential target access; close/dispose input in finally. Return nine JPEG Blobs and aggregate counters. No URLs, persistence, nested workers, private-field patches or fallback. Use known typed failures only.

## Task 3 — Serial comparison and UI (TDD)

Create `src/benchmark/runExtractionBenchmark.ts`, `CustomExtractionBenchmark.vue` and specs; modify `VideoBenchmarkView.vue` only to select a mutually exclusive mode. Unit tests first for alternating order, target reuse, preserved failures, stop/hidden handling, no overlapping jobs/suites, export privacy and cleanup. Use the same browser-wide benchmark Web Lock as existing pipeline tests. Keep all old pipeline types, validators and reports unchanged; new report mode `preview-extraction-custom-v1` with independent schemaVersion 1.

UI: file picker, explicit experimental-memory acknowledgement, repetitions, start/stop, live per-job status, labeled timing table, local thumbnail samples, copyable JSON, third-party notices. No fixture requirement. Warn against other active review tabs and state that an OOM may still kill the tab. Numeric exports remain separate from local images. Clear/revoke previous images on rerun, selection change, mode switch and unmount.

## Task 4 — Verify, review and preprod handoff

Run focused tests, lint, type-check, full unit suite and build serially. Add a browser smoke using locally generated/public tiny MP4 test media on the devbox (the owner never needs it), exercising custom selection, both backends, result counts/copy/stop and normal pipeline mode. Validate license/source artifacts and worker delivery in the built app. Reuse existing browser environment if available; no per-agent containers. Browser restrictions/failures remain explicit, not claimed as native owner acceptance.

Use requesting-code-review for the new worker/report boundary and address findings before commit. Follow the existing unsquashed-feature preprod smoke workflow when deployment authority/runbook is established, never merge first. No production enablement, squash, catalog wipe or resource cleanup. Handoff gives exact UI steps for the owner's files and explicitly separates extracted-image/native performance acceptance from automated smoke.
