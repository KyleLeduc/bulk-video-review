# Video processing measurement implementation

> Use executing-plans, test-driven-development, verification-before-completion and requesting-code-review. This expands Task 1 of the approved parallel-video-processing plan; it does not authorize workers, a demuxer, integration or deployment.

**Goal:** Measure the existing DOM pipeline without changing scheduling, media output, persistence formats or cancellation policy. Produce a repeatable, privacy-conscious Chrome/Edge baseline procedure; do not substitute synthetic smoke clips for the representative corpus.

**Isolation:** `feat/video-processing-measurements` starts at verified security-refresh commit `922eac2`. Its intentionally private dependency install preserves the primary checkout's older shared install and unrelated devcontainer lockfile change. Serialize heavyweight commands.

## 1. Actual phase producers

- Add `VideoProcessingTiming` and its optional observer to existing metadata/preview options. Phases: metadata, seek, capture (including resize), encode, serialize (cover data URL), persistence. Each sample carries monotonic duration and completed/failed/aborted outcome, but no filename, URL, bytes or session identity.
- Add a small shared timing helper under application services, used by both infrastructure producers and application persistence boundaries. Keep synchronous capture synchronous. Preserve results/errors; a diagnostic observer failure must not turn a successful media operation into failure and must be logged.
- First add failing fake-clock regressions in `BrowserVideoFileParser.spec.ts`, `VideoThumbnailGeneratorAdapter.spec.ts`, and `videoDomUtils.spec.ts`. Then instrument actual awaited metadata/seek/encode/serialize and synchronous canvas boundaries. Keep adapter pass-through, cleanup, deadlines, timestamps and frame formats unchanged.
- Add failing use-case tests for extractor observer forwarding, awaited repository durations and failures. Instrument `LinearVideoIngestionUseCase.ts` and `UpdateVideoThumbnailsUseCase.ts`, including failure-tracker operations; attach video identity in the ingestion coordinator, not the DOM helpers. Avoid counting enclosing extraction/generation as another phase or double-counting nested persistence.
- Run targeted producer/use-case tests to green, then app types.

## 2. Session reports and visible diagnostics

- Add bounded per-phase aggregates (sample count, completed/failed/aborted, total and maximum milliseconds) for foreground and previews to each existing ingestion session. No unbounded sample/event collection.
- Bind foreground callbacks to the execution session and preview callbacks to the owning session IDs at attempt start. Preserve interruption/requeue work in the original session, reject late callbacks after settlement, and keep completed report snapshots stable across later imports/manual retries.
- Count preview attempts separately from unique-video readiness: started, completed, failed, aborted. Foreground cancellation remains unsupported until Task 5a; do not imply otherwise.
- Add a versioned `measurements` block (version 1) to the existing additive schema-1 report; retain all existing report fields. Label backend `dom`, workers disabled, fallback reason null (not an invented runtime fallback). Explain summed concurrent phase work is not wall time. Return detached snapshots, without job/file identifiers.
- First add failing scheduler/session and diagnostics tests; implement the smallest report/UI changes and rerun targeted tests. Keep existing queue wait and execution times separate.

## 3. Browser measurement harness and qualification

- Extend built-browser smoke assertions to verify real populated phase reports in Chrome and Edge. Original synthetic clips qualify instrumentation only.
- Add `docs/testing/video-processing-performance.md` with an isolated-profile, fixed-corpus protocol: five runs per Chrome/Edge and foreground 1/2/4 × preview 1/2, cold versus warm catalog/cache stated separately, identical build/hardware/resources, UI first-visible and long-task measurements in the browser, and redacted export fields.
- Use an opt-in browser harness for repeatability, without application-only test hooks, operator profile resets or shipping a second telemetry system. Record actual run evidence; leave representative-corpus results explicitly pending until the user identifies permitted inputs.
- Sequentially run lint, app/Cypress types, targeted/full unit tests, coverage as appropriate, production build, and actual Chrome/Edge instrumentation smoke. Request independent read-only review of contracts, session attribution, observer failures, privacy and performance overhead; resolve findings and rerun affected checks.
- Commit/publish only reviewed code/tests/docs and original synthetic fixtures if changed. Never include operator corpus or benchmark output with sensitive names. Keep branches reviewable; no merge or preprod release.

**Baseline gate:** Do not claim measured bottlenecks, representative throughput, UI acceptance, speedup or completed Task 1 until the fixed native-browser corpus results exist. Continue safe instrumentation/harness work while the corpus question is unanswered; worker implementation remains gated.

## 2026-09-04 measurement-only checkpoint

- Steps 1–2 implemented and verified with test-first regressions. Step 3's probe, protocol and real Chrome/Edge instrumentation smoke are verified; representative baseline runs remain pending, not waived.
- 323 unit/coverage tests, lint, app/Cypress types and production build passed. Review fixes were reproduced and verified; no remaining review findings. See the [measurement evidence](../testing/video-processing-performance.md).
- No workers, dependency changes, database migration, integration, preprod deployment, operator catalog reset or video corpus publication. The measurement branch remains stacked on the separately reviewable dependency branch.
