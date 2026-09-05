# Custom Benchmark Files Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repeat arbitrary local user videos in isolated benchmark trials and show actual outcomes separately from reference evidence.

**Architecture:** Extend the existing benchmark protocol with explicit custom selection/evidence, pass it through the same host lifecycle and apply custom outcome validation. No normal-store or persistence changes.

**Tech Stack:** Existing Vue/Pinia, TypeScript/ESM, IndexedDB, Vitest/Cypress and Node tools; no dependency changes.

---

## Task1 — Selection and evidence contract

Files: `src/shared/benchmark/videoBenchmarkProtocol.js`, `.d.ts`, `.spec.ts`.

1. Add failing tests for nonempty bounded custom File selection, immutable ordered-size metadata, rejection of malformed/mismatched selection, and redaction.
2. Add failing custom report/suite tests for actual input/output counts, invalid/nonterminal evidence, explicit mode separation and strict reference rejection. Run `npx vitest run src/shared/benchmark/videoBenchmarkProtocol.spec.ts --exclude '.worktrees/**'`.
3. Implement minimal pure helpers in the existing protocol. Custom mode has opaque selection ID, ordered sizes and selection-only verification. Allow custom validation only by explicit option; default CLI still rejects it. Reuse established terminal/timing/measurement invariants without asserting fixed reference phase counts.
4. Rerun targeted tests and legacy runner tests; commit explicit files.

## Task2 — Host and actual output plumbing

Files: `src/benchmark/runVideoBenchmarkSuite.ts`, `.spec.ts`, `videoBenchmarkHost.ts`, `.spec.ts`, `run.ts`, `VideoBenchmarkTrial.vue`, `.spec.ts`.

1. Add failing tests for custom mode/selection propagation, snapshot stability and non-reference output counts; retain exact DB/lock/close semantics.
2. Pass optional validated custom selection to fresh hosts; validate before creating services. Derive custom persisted-success expectations from actual terminal report while independently checking repository/store/preview counts, JPEG decoding and timestamps. Preserve failures, timing and metadata. Reference path unchanged.
3. Run `npx vitest run src/benchmark src/shared/benchmark --exclude '.worktrees/**'`; add cases for malformed input, all-invalid/partial media and cached consistency. Commit explicit files.

## Task3 — UI and browser acceptance

Files: `src/benchmark/VideoBenchmarkView.vue`, `.spec.ts`, `cypress/e2e/videoBenchmark.cy.ts`, `docs/testing/video-processing-performance.md`.

1. Test mode switching, arbitrary file admission, bounds, disabled controls during runs, redacted custom export and visible actual outcomes.
2. Add native multiple-file custom picker; keep fixture picker/default and guard intact. Clear owned display URLs/selection/results on mode switch. Label custom results and their limitations.
3. Extend existing opt-in browser smoke with small public non-reference videos, invalid/duplicate input, fresh/cached repetitions, stop and normal-catalog sentinel. Run Chrome/Edge serially against built runtime; retain reference smoke separately.
4. Update native instructions and run lint, app/Cypress types, full unit tests/coverage/build serially. Request independent read-only contract/storage review; fix findings and rerun affected checks. Commit explicit files.

## Task4 — Existing preprod handoff

1. Verify actual live release/rollback and retained enabled flag; no platform mutation required.
2. Publish the feature commit to its existing remote branch without rewrite; wait for exact successful CI and scanned immutable publication.
3. Deploy through fixed BVR workflow; verify digest/health/HTTPS, existing infrastructure smoke and disposable custom browser smoke on preprod.
4. Remove only the task-owned browser container after label/mount inventory. Preserve evidence/images/volumes/branches/worktrees. Hand off native custom-file selection and JSON/UX feedback, plus the user's SCP command for public reference fixtures.
