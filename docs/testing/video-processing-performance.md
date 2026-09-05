# Video processing measurements

Status: measurement-only implementation verified locally and reviewed on `feat/video-processing-measurements`, based on security-refresh `922eac2`. No worker implementation, speedup claim, merge or preprod deployment. The representative local corpus has not yet been identified by the user; the fixed native Chrome/Edge baseline remains pending. Exact published CI is a separate gate.

## What the report measures

Diagnostics → Run report retains schema version 1 and adds `measurements.version: 1`:

| Phase | Actual boundary |
|---|---|
| metadata | Awaited DOM video metadata load, for cover extraction or preview generation |
| seek | Awaited seek, including retries/timeouts within that seek |
| capture | Synchronous canvas allocation, dimensions, draw and resize |
| encode | Awaited JPEG `toBlob` completion, failure, timeout or abort |
| serialize | Cover Blob → persisted data URL; preview frames stay Blobs |
| persistence | Awaited aggregate/preview repository and failure-tracker operations; not event publishing |

Each foreground/preview phase contains `count`, `completed`, `failed`, `aborted`, `totalMs` and `maxMs`. Durations use `performance.now()`. These are **summed operation elapsed times**, not CPU time or exclusive pipeline wall time: concurrent operations overlap and waits include native browser work. Do not sum phase totals to calculate throughput. An absent phase means no samples, not free work. Queue wait and the existing foreground/preview/pipeline wall-time fields remain separate.

Preview attempts are distinct from ready videos. Interrupted attempts count as aborted; requeued work adds another attempt. A storage transaction's AbortError is an aborted persistence sample but a failed preview attempt unless the job's cancellation signal was actually aborted. A shared resumed job is credited to each owning session; do not sum sessions as a global physical-work counter. Removal/clear leaves a report nonterminal until its outstanding attempts settle. Later manual retries cannot change a completed run report.

Backend is `dom`, workers disabled, fallback reason null: there is no worker backend to fall back from yet. Foreground cancellation is explicitly unsupported; the future cancellation/drain work is not implemented by these diagnostics. No database version, ID hashing, source ownership or media output changes.

Aggregates have at most six phase entries per lane, not an unbounded event stream. Exported reports exclude filenames, video IDs, URLs and file contents. Reports still contain environment information, input byte/count summaries and timestamps; review before sharing. Timing callback failures are logged and cannot replace media/persistence results or errors.

## Repeatable native Chrome/Edge protocol

1. Use the same built revision, machine, power mode, viewport, foreground tab, browser versions and resource limits for every comparison. Record browser/OS, hardware, app revision and whether DevTools/probe are enabled. Do not benchmark a development/HMR server or run tests/builds concurrently.
2. Obtain an explicitly permitted, locally held fixed corpus covering short/long videos, high resolution, portrait/rotation, variable frame rate, duplicates, malformed inputs and supported/unsupported codecs. Keep a private manifest with order, formats, dimensions, duration and byte totals. Do not put operator videos, private paths or names in this public repository.
3. Launch a **separate disposable browser profile** against the built app, not the user's current catalog/profile. Never use Diagnostics → Wipe Database on the operator profile. Use one browser at a time. A fresh profile provides a cold catalog, not a cold OS disk cache; record disk/browser cache conditions honestly.
4. Set Diagnostics foreground concurrency to 1, 2 or 4 and previews to 1 or 2 **before** selection. Close Diagnostics during measured work. Keep filters cleared, the gallery initially empty and the top of the gallery visible.
5. Paste the entire trusted local `scripts/videoProcessingProbe.js` into that profile's DevTools console, then call `bvrVideoProbe.arm()`. This opt-in script is not bundled into the application. It starts on the next file-input change, before the application handler, excluding time spent choosing files. Select the corpus in its fixed order.
6. Once foreground and previews are fully settled, call `bvrVideoProbe.stop()` and save its returned JSON privately. Open Diagnostics and copy the final run report. Pair both outputs with configuration/run number and private corpus identifier. Stop the probe even if the run fails. `stop()` removes listeners, cancels animation frames and disconnects the observer; stopping twice returns null. Reload removes the installed probe entirely.
7. For a warm-catalog pair, reload without resetting that **disposable** profile's catalog, reinstall/arm the probe and reselect the identical corpus. The gallery starts empty after reload, but cached metadata/previews should be restored without new decode/encode jobs. Warm runs are a separate workload, not evidence of faster decoding.
8. Run five measured cold/warm pairs for each foreground × preview setting in both Chrome and Edge: 2 browsers × 3 foreground settings × 2 preview settings × 5 pairs. Keep warmups separate. Retain all runs and explain exclusions before computing medians; no cherry-picking. Recreate only the disposable profile between cold pairs, preserving the operator profile.

The probe reports the first animation-frame callback that observes a loaded thumbnail intersecting the viewport, maximum animation-frame gap, and bounded long-task count/total/max. `firstVisibleThumbnailMs` is a rendering opportunity observation, **not proof of pixels painted**; `elapsedMs` includes the operator's delay before stopping, so use the app's settled pipeline time for throughput. Keep probe/DevTools overhead identical between variants. Discard UI timing comparisons if `hiddenDuringRun` is true or the gallery was already populated/hidden/filtered at selection.

Long tasks describe main-thread work lasting at least 50 ms, with browser-dependent support; unsupported is reported explicitly, not as zero-cost work. See [MDN Long Tasks](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming). Animation-frame callbacks run before repaint and may pause in hidden tabs; see [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). The probe stores no task attribution URLs or file data and performs no network/storage calls.

The probe does **not** calculate p95 interaction latency or peak native decoder memory. For those acceptance gates, keep native Performance/Task Manager evidence: run the same documented search, scroll, filter, playback and cancellation interactions during each workload; retain interaction timing distributions and peak process-memory observations privately. Do not substitute frame-gap maxima or a headless Cypress duration for p95 interaction latency. Native pointer/drag/visual acceptance remains separate.

## Verification and result record

Long-task count includes any qualifying task overlapping the measurement window. Its total/max milliseconds are clipped to the selection-to-stop interval, including the initial selection task even if it began before the capture listener. A clipped portion can therefore be less than 50 ms. Do not interpret these numbers as the full duration of boundary-crossing tasks.

- Original synthetic smoke fixtures: 4-second 160×90 blue MP4 and 65-second 160×90 red MP4; provenance in `cypress/fixtures/videos/README.md`. They exercise real metadata, seek, capture, encoding and IndexedDB, but are not a representative throughput corpus.
- Unit regressions cover phase producers, observer failure safety, actual awaited persistence, per-session identity, separate queue wait, shared/requeued jobs, removed/cleared attempts, late callbacks, detached reports, and probe lifecycle.
- `cypress/e2e/example.cy.ts` loads the same opt-in probe in the actual app window and checks real populated phase reports, 18 preview encodes for two videos, settled attempt counts and cached reimport without new media work. No parser/encoder mocks or uncaught-exception suppression.
- Run sequentially: `npm run lint`, `npm run type-check`, `npm exec -- tsc --noEmit -p cypress/e2e/tsconfig.json`, `npm run test:unit -- --maxWorkers=2`, `npm run test:ci -- --maxWorkers=2`, `npm run build`, Chrome smoke, Edge smoke. Use the existing shared environment or one root-owned disposable browser container; no per-agent containers or volumes.
- Final local verification on 2026-09-04: lint, app/Cypress types, all 323 unit tests, all 323 tests with V8 coverage (73.93% lines), production build and diff whitespace checks passed. Independent read-only review has no remaining Critical/Important/Minor findings. Red/green review fixes cover removed/cleared attempt settlement, boundary-crossing long tasks and avoiding report construction/serialization while Diagnostics is closed.
- Actual built Chrome 152.0.7977.64 and Edge 152.0.4191.53 smoke passed under Cypress 16 / Node 24.20.0 in one disposable official browser container, pinned image manifest `sha256:4e487953a62c66c9b0ba84e07ecc84089612e213718b2a76c13c98ca66f97bae`. Limits: 2 CPU, 4 GiB memory, 1 GiB shared memory; only this worktree mounted, no host ports or Docker volumes/operator profiles. Headless workflow durations 5.962s / 6.863s are **test durations, not performance benchmarks**. Browser phase/probe assertions, cached media reuse, filtering, playback and persistence all passed; no screenshots or video recordings were generated.
- Representative corpus, five-run configuration matrix, p95 interactions, peak native memory and bottleneck conclusions remain **pending**. Task 1 of the parallel-processing plan is not complete until those baseline gates are met.
