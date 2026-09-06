# Benchmark plan runner and three-second clips

> Execute test-first to the local smoke checkpoint. This supersedes the earlier five-second proposal.

**Goal:** One-click, versioned benchmark presets with complete/partial exports and a small motion-preview experiment using three-second muted MP4/WebM loops.

**Architecture:** Keep all work in the experimental benchmark. Existing still reports remain schema 4. A plan report contains ordered, labeled standalone reports; the shared Web Lock covers the entire suite. A separate disposable clip worker uses the pinned Mediabunny conversion API, one input and sequential windows, bounded reads/output and a deadline. No production DI, persistence, dependency or deployment changes.

**Tech stack:** Vue, TypeScript, Mediabunny 1.55.7, WebCodecs, Vitest, Cypress.

## 1. Plan orchestration (red, green, verify)

- Add tests in `src/benchmark/runExtractionPlan.spec.ts` for versioned presets, reversed backend order, a single suite lock, stop/hidden partial results, failures and sample suppression during timing.
- Implement presets and plan entry point using the existing runner's private unlocked implementation. Preserve manual API and schema.
- Presets: full still matrix (9/100, 2/4 jobs, both backends, two reversed passes); short nine-still confirmation; one-job motion smoke.
- Export identity/selection/settings and per-step reports, not names/paths/blobs. Progress and completed reports remain available during the run. Configurations never overlap.
- Run targeted Vitest tests.

## 2. Clip boundary (red, green, verify)

- Test window policy and bounded output validation in `src/infrastructure/video/benchmark/clipExtraction.spec.ts`; test client deadline/abort/worker cleanup.
- Generate up to ten evenly spaced three-second windows. Short videos get fewer non-overlapping windows; under three seconds gets one shortened clip. No identical clamped windows.
- MP4/H.264 input qualification unchanged. Resize to at most 320 pixels on the longest side, even dimensions, no meaningful upscaling; 10 fps, muted, forced transcode. Prefer supported AVC/MP4, otherwise VP8/WebM. Report actual format, do not silently fall back to DOM.
- Use cumulative 1 GiB reader budget and 16 MiB total output ceiling, bounded stream writes before copying, 120-second file deadline. These are not hard parser/decoder memory caps.
- Measure setup, conversion/muxing, reads, first encoded clip, total worker time and wall time. Do not invent separate overlapping decode/encode timings.
- Tests for success, malformed output, unsupported encoder, cancellation and failure preservation.

## 3. UI and smoke checkpoint (red, green, verify)

- Extend the existing benchmark with preset selector, Run test plan, progress/elapsed, partial summary, Copy all JSON and Download JSON. Keep manual controls.
- Show only latest successful clip file after the suite, no playback while timing. Muted looping videos with native controls; no automatic simultaneous playback.
- Add component tests for controls, partial export, sample cleanup and playback rendering. Add real fixture Cypress smoke for plan order, output count/duration, actual playable loops, cancellation and export hygiene.
- Document NAS/cache caveats, pinned-version metadata inventory and exact next user smoke steps in `docs/testing/custom-mediabunny-benchmark.md`.
- Run lint, type-check, targeted then full unit tests, build, Chrome/Edge smoke serially. Obtain read-only architecture review and address important findings.
- Stop at local smoke checkpoint. Report deployment and user NAS visual acceptance as pending.
