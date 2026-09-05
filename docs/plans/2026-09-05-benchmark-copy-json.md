# Benchmark Copy JSON Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the user paste the unchanged benchmark report directly into chat and understand that fresh repetitions reset app storage, not browser/OS caches.

**Architecture:** Keep the UI-only export action inside the existing benchmark view, following DiagnosticsPanel's asynchronous clipboard feedback pattern. Preserve the current report schema and isolated pair lifecycle. No dependencies, ingestion changes, cache flushing or warmup exclusions.

**Tech Stack:** Existing Vue, TypeScript, Clipboard API, Vitest, Cypress and immutable homelab preprod workflow.

## Design

The user explicitly requested copy/paste support. Prefer a Copy JSON button beside Download JSON; retaining only the current collapsed textarea is less discoverable, while a new export format would break exact comparison with downloads. Copy the existing pretty-printed JSON without filtering failures or adding private data. Clipboard writes require permission and a secure context; if unavailable/denied, open the existing JSON details, focus/select its readonly textarea and announce manual Ctrl+C/Cmd+C instructions. Keep download as a separate option.

Disable copying before a report exists, during processing and during a pending clipboard request. Clear feedback on a new suite/selection. Snapshot the result identity and ignore an old request's success/failure after selection/result changes. A clipboard failure must not change the benchmark status or evidence.

The observed 25/17/13/10/10-second fresh sequence is not enough to identify the cause. Source/tests show a new pair UUID/database for each repetition/configuration, a new iframe for each trial and awaited owned-database deletion after each pair; cached trials intentionally reuse only that pair's database. Browser/OS state and the same selected File objects persist. Explain this without claiming hardware/browser caches were flushed or silently discarding early runs. The user's JSON can establish created/existing counts, preview attempts/frames, phase counts/times and cleanup status, but cannot prove an OS cache hit.

## Task 1 — Copy behavior, test-first

Files: `src/benchmark/VideoBenchmarkView.vue`, `src/benchmark/VideoBenchmarkView.spec.ts`.

1. Add UI tests for disabled-before/during-run, exact copied JSON on completed/failed suites, success feedback, unavailable/denied clipboard opening/selecting fallback, and stale asynchronous feedback after reselection/new suite. Mock only suite execution and clipboard I/O; render the real component with a typed complete suite envelope.
2. Run `npx vitest run src/benchmark/VideoBenchmarkView.spec.ts --exclude '.worktrees/**'`; require failures caused by missing Copy control.
3. Add `copying`, `copyStatus` and DOM refs. The handler snapshots `result.value` and `exported.value`, awaits `navigator.clipboard.writeText`, shows success only for that same result, and catches failure to open/focus/select the existing textarea with instructions. Recheck identity after `nextTick`; reset feedback in existing reset/start paths. Bind an accessible status and disabled Copy JSON button.
4. Clarify the existing fresh/cached help text that repetitions do not restart the browser or clear browser/OS caches; no runtime lifecycle change.
5. Rerun targeted tests, app types and lint. Commit explicit files after verification.

## Task 2 — Browser regression and interpretation guidance

Files: `cypress/e2e/videoBenchmark.cy.ts`, `docs/testing/video-processing-performance.md`.

1. Extend opt-in custom benchmark smoke to copy the actual completed report and validate copied text equals the displayed JSON. Cover manual fallback in the browser when clipboard permission is denied. Keep reference/normal-catalog guards unchanged; do not collect a new performance matrix for this UI-only change.
2. Add Copy JSON/fallback instructions and interpretation of decreasing fresh times. Preserve all repeats and recommend checking fresh created/existing counts, frame/attempt totals and phase trends before attributing a speedup.
3. Run targeted benchmark tests, full unit suite, lint, app/Cypress types and production build sequentially; run Chrome/Edge smoke in one bounded disposable environment. Request bounded read-only review, correct findings and rerun affected checks.

## Task 3 — Existing preprod handoff

1. Refresh exact current preprod/rollback and unchanged manifest/controller/flag boundaries. Publish the existing feature branch without squash/merge and require CI success for the exact SHA including scan/runtime smoke/immutable publication.
2. Use the fixed homelab BVR preprod workflow, preserving rollback and operator browser data. Run HTTPS infrastructure smoke plus disposable Chrome/Edge copy/fallback tests against the deployed image.
3. Remove only the verified task-owned browser container; preserve shared images, all volumes, worktrees and evidence. Hand off Copy JSON and request the user's full suite for per-phase/count interpretation. Do not claim the user's timing cause has been established.
