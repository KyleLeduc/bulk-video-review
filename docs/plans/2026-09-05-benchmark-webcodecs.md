# Benchmark WebCodecs Qualification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Qualify a pinned demuxer for bounded, correct MP4/H.264 preview extraction before exposing a new benchmark backend.

**Architecture:** A test-only browser entry drives the same infrastructure extraction module that a later benchmark adapter will use. A single module worker owns the original File, demux input, decoder/sink and output lifecycle; it never owns persistence or playback URLs. Normal-app composition and existing DOM benchmark behavior remain unchanged during qualification.

**Tech Stack:** Existing TypeScript/Vite/Vitest/Cypress tooling; proposed `mediabunny@1.55.7`, browser WebCodecs and OffscreenCanvas. No additional codec, WASM or test framework.

---

## Entry and stop conditions

- Read the [design](2026-09-05-benchmark-webcodecs-design.md), [dependency decision](../decisions/video-worker-demuxer.md) and [native evidence](../testing/video-processing-performance.md#native-custom-dom-concurrency--2026-09-05).
- **Owner approved Mediabunny benchmarking on 2026-09-05**, accepting the proposed `1.55.7` candidate. Approval qualifies this experiment, not normal-app enablement or a merge/deploy instruction.
- Reuse `feat/video-benchmark-view`; run `npm run worktree -- bootstrap .worktrees/feat-video-benchmark-view` from the primary checkout. Inspect shared `node_modules` target and active users before a deliberate private install. Preserve the root's unrelated AGENTS/devcontainer changes and other worktrees.
- Use @test-driven-development for code, @verification-before-completion for every checkpoint and @requesting-code-review for the source/worker boundaries. Root owns the shared environment; serialize heavyweight checks. No write-heavy delegation.
- This is the **library qualification** plan. The design sketches subsequent real-pipeline integration, but those edits wait for the spike's measured API/resource findings. Do not label the extraction-only spike's timing as comparable to the 9.45-second full-pipeline baseline.

## Execution checkpoint — 2026-09-05

Task 1's pinned-source audit reached the explicit resource stop condition **before installation**. Small [reproducible metadata-only probes](../testing/mediabunny-qualification.md) confirm that compact MP4 timing entries expand into per-sample presentation indexes without further reads, and the library allocates a requested-range buffer before invoking the proposed callback guard. The pinned public API exposes neither the required pre-allocation range admission nor a pre-expansion sample/index budget. Source-cache and callback range limits therefore do not satisfy the approved allocation requirements.

The only added executable is `scripts/qualifyMediabunnyIndex.mjs`, an offline, fixed-synthetic-input audit probe loading a separately verified package archive. It is not an app adapter or browser route. No package/lock change, private install, extraction worker, new benchmark backend or deployment was made. Tasks 1's install/packaging steps and 2–4 are deferred at this gate, not completed. Resume only after an explicit decision on an upstream/library admission limit or a revised experiment scope; do not patch library internals, write a second MP4 parser, weaken limits or install an alternative implicitly.

## Task 1: Pin and audit the approved package

**Files:** modify `package.json`, `package-lock.json`, `docs/decisions/video-worker-demuxer.md`; create `docs/third-party/mediabunny.md` and the license/source-notice artifact required by the selected distribution arrangement.

1. Record approval of the exact package/version. Read the pinned published source and license, manifest dependencies and advisories. Confirm actual runtime/tooling requirements; inspect source for partial reads, metadata/index retention, seek/decode queue limits and sample disposal. Record gaps rather than inferring them from API documentation.
2. Establish a private worktree install without touching the shared symlink's target. Explicitly change only the worktree manifest/lock to add exact `mediabunny: "1.55.7"`, then run `npm ci` in that isolated install with network escalation. No blanket audit fix or runtime/toolchain upgrade. Record resolved transitive changes, integrity and source identity.
3. Run `npm run type-check`, then `npm run test:unit`, then `npm run build`, one at a time. Expected: existing checks remain green. Inspect worker-compatible ESM imports and preserve the app's current browser targets.
4. Record license/source distribution handling and any security findings before shipping anything. Commit only the approved dependency/notice/decision files after review; unresolved package compatibility or resource-bound gaps stop the spike, not trigger a substitute package install.

## Task 2: Test guarded original-File reads

**Files:** create `src/infrastructure/video/benchmark/boundedFileSource.ts` and `src/infrastructure/video/benchmark/boundedFileSource.spec.ts`.

1. Write failing tests for valid slices, invalid/out-of-range requests, whole-file reads on a large fake File, individual-read/cumulative/in-flight caps, abort before and during a read, and dispose followed by late completion. A fake File must throw if its top-level `arrayBuffer()` is called; only bounded slices may be read. Tests assert rejection occurs before allocation and reservations are released on all paths.
2. Run `npx vitest run src/infrastructure/video/benchmark/boundedFileSource.spec.ts --exclude '.worktrees/**'`. Expected: new tests fail because implementation is absent.
3. Implement the smallest source factory over the approved library's `CustomSource`, using `maxCacheSize: 8 * 1024 * 1024` and `prefetchProfile: 'none'`. Validate before `slice`, keep a disposed/generation guard across awaits, and expose only aggregate counters. The range guard is:

   ```ts
   export function assertReadRange(start: number, end: number, size: number) {
     if (
       !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
       start < 0 || end <= start || end > size ||
       end - start > 1024 * 1024
     ) throw new RangeError('read-limit')
   }
   ```

   The guard is only one bound: reserve in-flight bytes and cumulative bytes before reading, count retained/copy storage, honor the design's combined allowances and discard post-dispose results. Do not log private names, source offsets or library exception strings. A rejected legitimate range is a qualification outcome, not permission to concatenate an unbounded response.
4. Rerun the focused tests to green; inspect the pinned library's actual requests with public fixtures. Document whether metadata/index allocations remain bounded; source-cache limits alone do not pass this gate. Commit the source and tests only when its actual limits are understood.

## Task 3: Build a one-job extraction worker with bounded retirement

**Files:** create `src/infrastructure/video/benchmark/extractPreviewFrames.ts`, `src/infrastructure/video/benchmark/extractPreviewFrames.spec.ts`, `src/infrastructure/video/benchmark/previewExtraction.worker.ts`, `src/infrastructure/video/benchmark/previewWorkerClient.ts`, `src/infrastructure/video/benchmark/previewWorkerClient.spec.ts`.

1. Write failing tests for original File structured cloning (not a transfer-list entry), worker generation/job matching, duplicate/late messages, startup/error/messageerror, abort with a pending read/decode, one-second termination escalation and output limits. No more than one active extraction per client; no worker may create child workers. A terminated/disposed client rejects later success and never starts fallback.
2. Run `npx vitest run src/infrastructure/video/benchmark --exclude '.worktrees/**'`; expect new tests to fail for the missing worker/client implementation, not fixture setup problems.
3. Implement capability checks inside the worker and MP4/H.264 track qualification. Use `Input` with MP4-only format and the guarded File source. Prefer the approved sink's timestamp selection/rotation facilities if the pinned-source review proves their bounds; do not write a bespoke container parser. Avoid unbounded full-track packet/frame iteration and expensive duration/statistics scans.
4. Preserve exactly nine existing target labels and output ordering, including duplicates. Check display-size/estimated raw-byte admission before decoding/allocation; await JPEG encoding before reusing a canvas. Close each returned sample immediately after use; dispose input/decoder/iterators in `finally`. Return at most the fixed nine JPEG Blobs and allowlisted aggregate evidence. No IndexedDB or URL creation/revocation in the worker.
5. Retain slot/budget ownership until completion or termination. Test every success/error/abort/timeout branch, raw/encoded input/output limits, malformed configuration, null samples, nonzero timeline starts, repeated targets, unsupported transformations and long-GOP budget exhaustion. Unsupported cases return a typed reason; abort remains distinct. Internal decoder queues/metadata memory must be qualified independently of application-held sample counts.
6. Rerun targeted tests to green, review the lifecycle boundaries and commit. Unit mocks are not evidence of native decoding, sparse seeks or native memory bounds.

## Task 4: Qualify actual built-browser behavior on public fixtures

**Files:** create `src/benchmark/qualification.ts`, `benchmark/qualification.html`, `cypress/e2e/videoDemuxerQualification.cy.ts`; modify `vite.config.ts`, `cypress.config.ts`, `scripts/benchmarkBuild.mjs`, `scripts/productionServer.mjs` and their existing tests where needed to reserve/gate the qualification route; record results in `docs/decisions/video-worker-demuxer.md`.

1. Before implementation, add failing route/asset tests: the qualification page is a benchmark-only built entry, unavailable unless the existing runtime flag is enabled, and excluded from normal Cypress smoke. Do not add a production link or accidentally let SPA fallback serve a disabled reserved route. Use current gate/build-identity helpers rather than duplicating them. Inventory the existing matching test paths before editing.
2. Make a minimal test harness that accepts only the prepared public fixture manifest, starts one worker at a time and renders decoded frame evidence for Cypress inspection. It is not a second product view, custom-file upload surface, or full-pipeline performance mode. It never imports the production container or opens the normal catalog.
3. Use the existing public reference corpus where applicable, plus reproducibly generated public/synthetic fixtures with visible frame numbers and an expected presentation timeline. Retain fixtures/manifests in ignored task evidence; document exact generation commands, attribution, hashes and expected frame IDs. Cover head/tail metadata, large sparse reads, long GOPs, B-frames/VFR, rotation/portrait, repeated targets, truncated/encrypted/unsupported inputs and abort/timeouts. Do not use the owner's media or fabricate coverage from file extensions.
4. Run targeted gate/unit tests, then `npm run lint`, `npm run type-check`, `npm run test:unit` and `npm run build` serially. Start the enabled built runtime using the existing local runbook. Run `BVR_BENCHMARK_SMOKE=true npx cypress run --e2e --browser chrome --spec cypress/e2e/videoDemuxerQualification.cy.ts`, then the same command with `--browser edge` inside the already-prepared browser environment. Missing browser capacity is an open acceptance check, not a pass; root alone may prepare a needed environment within authorized scope.
5. Verify actual frame content/PTS against fixture truth, not just the requested output label; inspect rotation/resizing, worker URL/MIME and library/source assets. Check actual reads and cumulative/decode work near distant targets, cancellation latency and no outstanding resources after disposal/termination. Record counters and process-memory observations with their limitations. Probe unavailable APIs/unsupported codecs and keep all failure evidence.
6. Measure built raw/gzip worker bundle delta and confirm normal-app loading does not import the candidate. Record exact package/build/browser/fixture identities, all results and unresolved internal metadata/native-memory risks. Review and commit the qualification outcome. A safe rejection is valid evidence; do not weaken bounds just to get a passing performance row.

## Handoff: real pipeline comparison only after qualification

If qualification passes, expand the reviewed implementation plan using the design's source/DI boundary and actual spike findings. Relevant existing files are `src/application/ports/IVideoThumbnailGenerator.ts`, `src/application/ports/IVideoSessionRegistry.ts`, `src/infrastructure/video/services/VideoSessionRegistry.ts`, `src/infrastructure/adapters/VideoThumbnailGeneratorAdapter.ts`, `src/application/usecases/UpdateVideoThumbnailsUseCase.ts`, `src/infrastructure/di/createVideoServices.ts` and their callers/tests. Keep production `src/infrastructure/di/container.ts` unchanged.

Then add the candidate to `src/benchmark/run.ts`, `VideoBenchmarkView.vue`, `VideoBenchmarkTrial.vue` and `runVideoBenchmarkSuite.ts`, and coordinate protocol/report versions in `src/shared/benchmark/videoBenchmarkProtocol.js` / `.d.ts`, validators, host/build/runtime gates and `scripts/videoProcessingBenchmark.mjs`. Cover source ownership, fallback identity, cached no-work behavior, backend-order alternation, cleanup, privacy and unchanged DOM results before enabling the option. Exact implementation depends on the qualified adapter API; this paragraph does not authorize bypassing review or version checks.

Only the resulting **full-pipeline** benchmark can be compared against the documented DOM baseline. Follow feature-preprod smoke on the unsquashed branch once release authority is established. Give the owner concise visible-tab steps for identical-file DOM/candidate comparisons and image/interaction checks. Do not request more unchanged DOM-only suites, enable normal-app workers, merge or clear any catalog as part of qualification.
