# Video Benchmark View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a dev/preprod-only page that repeatedly benchmarks the real DOM ingestion/preview pipeline on fixed local fixtures without touching the operator catalog, ready for a subsequent WebCodecs comparison.

**Architecture:** Separate Vite HTML entries host controls and a fresh per-trial Vue/Pinia execution context, reusing the existing store, use cases and repositories through a small DI factory. A constrained benchmark database per fresh/cached pair isolates storage; the browser page and CLI share pure case/result definitions while retaining their distinct evidence modes.

**Tech Stack:** Existing Vue 3, Pinia, TypeScript/ESM, Vite 7, IndexedDB v4, Web Locks, Node built-ins, Vitest and Cypress; no new dependency.

---

## Execution boundaries and preparation

Read the [approved direction and detailed design](2026-09-05-video-benchmark-view-design.md) in full. This document is a plan, not a completed implementation or deployment. Implementation requires its own execution turn; do not start the later decoder experiment here.

Start from the measurement branch containing this plan, not older `master`. Bootstrap that existing base checkout first with `npm run worktree -- bootstrap`. Use @using-git-worktrees to create `feat/video-benchmark-view` with `npm run worktree -- add feat/video-benchmark-view` from the selected base checkout. Confirm ancestry, then run `npm run worktree -- bootstrap <path>` before npm/dev work there. Primary `node_modules` still belongs to the older toolchain: preserve it, and reuse the compatible measurement install explicitly or qualify an intentional private install before testing. Do not accidentally test Vite 7 work against primary Vite 5. No second development container.

Preserve primary `.devcontainer/devcontainer-lock.json`, the separate uncommitted `AGENTS.md` change, all stashes, existing worktrees and baseline media/results. Re-read the primary feature-acceptance instructions; the feature worktree may not yet contain that edit. Activate @task-observability for the implementation, which is expected to exceed 15 minutes. Use @test-driven-development; run heavy tests/builds serially, network commands with escalation, and @verification-before-completion before any passing/completion claims. Architecture/storage changes require @requesting-code-review after implementation; delegate only separable read-heavy review.

For every task, perform red/run/minimal implementation/green/explicit-file commit separately. Minimal exports may precede a failing assertion, but import/setup failures do not prove the desired regression. Proposed contracts/snippets below describe new APIs, not functions that already exist. Use existing test utilities; do not add a testing framework or generic benchmark framework.

## Task 1 — Pure case ordering, fixture selection and result contracts

**Create:** `src/shared/benchmark/videoBenchmarkProtocol.js`, `src/shared/benchmark/videoBenchmarkProtocol.spec.ts`, `src/shared/benchmark/referenceFixtures.json`.

**Modify/test:** `scripts/videoProcessingBenchmark.mjs`, `scripts/videoProcessingBenchmark.spec.ts`.

1. Add failing tests for serial deterministic configuration rotation, adjacent fresh/cached pairs, future backend-order alternation, repetition/config caps, unknown backend rejection, fixture multiplicities/canonical order, and incompatible or incomplete result comparisons. Preserve existing CLI v1 expectations.
2. Run `npx vitest run src/shared/benchmark/videoBenchmarkProtocol.spec.ts scripts/videoProcessingBenchmark.spec.ts --exclude '.worktrees/**' --maxWorkers=2`; expect the new assertions to fail.
3. Implement pure ESM with JSDoc for browser/Node reuse. Extract only genuinely shared ordering/statistics/terminal-count validation from the existing runner; keep Node process/filesystem/provenance logic in that runner. Keep its public v1 helper signatures as thin compatibility calls if necessary. Introduce an explicit v2 envelope; do not reinterpret saved v1 rows.

   Minimal executable ordering model (validate inputs before calling):

   ```js
   export function enumerateTrialPairs(configurations, repetitions) {
     const pairs = []
     for (let repetition = 1; repetition <= repetitions; repetition++) {
       for (let index = 0; index < configurations.length; index++) {
         const configuration = configurations[
           (index + repetition - 1) % configurations.length
         ]
         pairs.push({ repetition, ...configuration })
       }
     }
     return pairs
   }
   // Each pair is executed fresh, then cached when selected; never concurrently.
   ```

   Define the v2 envelope with `protocolVersion: 2`, `mode: 'pipeline-no-gallery-v1'`, immutable suite configuration, expected/actual backend, fixture identity/verification, build/browser/cache/visibility identity, and all trial rows including non-success states. A row includes the existing terminal ingestion report, precise wall timing, output checks and cleanup status. Unknown/unavailable values are null with a reason. Do not sum overlapping phase totals into a wall-time percentage.

   Copy only the fixed public manifest/attribution metadata from the retained `bbb-sunflower-reference-v1` corpus; verify it against the ignored manifest before committing. Browser preflight checks selection identity without claiming a content hash. Do not add media or absolute local paths to the JSON.
4. Repeat the targeted command; expect all existing and new tests green. Verify v1 fixtures/raw reports still validate unchanged, and missing/duplicate/failed v2 rows cannot form a completed comparison.
5. Commit only these five files: `test: define repeatable video benchmark protocol`.

## Task 2 — Explicit benchmark database ownership

**Modify/test:** `src/infrastructure/database/DatabaseConnection.ts`, `src/infrastructure/database/DatabaseConnection.spec.ts`.

1. Add tests that production still opens only `VideoMetaDataDB` v4, benchmark connections never share that singleton, only canonical UUID tokens are accepted, separate pairs cannot share handles, and disposed/pending/blocked connections cannot reopen or resurrect. Test exact-name deletion only after closure, invalid-token rejection, and blocked deletion surfaced without broader cleanup.
2. Run `npx vitest run src/infrastructure/database/DatabaseConnection.spec.ts --exclude '.worktrees/**'`; expect the new ownership assertions to fail.
3. Add only constrained construction and explicit lifetime methods. Keep the current default API and migrations unchanged. Use this naming contract:

   ```ts
   const benchmarkDatabaseName = (pairId: string): string => {
     if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pairId)) {
       throw new TypeError('Expected a benchmark pair UUID')
     }
     return `BVRBenchmark-v1-${pairId.toLowerCase()}`
   }
   ```

   Proposed APIs: `DatabaseConnection.forBenchmark(pairId)`, `connection.close()` and `DatabaseConnection.deleteBenchmark(pairId)`. Return a distinct connection from each factory call; closing permanently disposes that instance and closes any late successful open. The host closes its handles, then the parent requests deletion of the pair ID it generated and recorded. Do not add arbitrary-name construction to presentation, `indexedDB.databases()` sweeping, production wipe calls or silent force cleanup.
4. Rerun to green. Keep migration/repository regressions green with `npx vitest run src/infrastructure/database src/infrastructure/repository --exclude '.worktrees/**'`.
5. Commit only the two changed files: `refactor: isolate benchmark database connections`.

## Task 3 — Reuse the real dependency graph

**Create:** `src/infrastructure/di/createVideoServices.ts`, `src/infrastructure/di/createVideoServices.spec.ts`.

**Modify:** `src/infrastructure/di/container.ts`.

1. Add tests that two supplied connections produce independent repositories/failure trackers/session registries, while both use the existing parser, thumbnail adapter and use-case implementations. Assert production exports retain their names and default behavior. Assert benchmark composition never calls `DatabaseConnection.getInstance()`.
2. Run `npx vitest run src/infrastructure/di/createVideoServices.spec.ts --exclude '.worktrees/**'`; expect isolation assertions to fail.
3. Move existing construction, not business logic, into `createVideoServices({ databaseConnection })`; leave production singleton acquisition in `container.ts`. Return the same concrete services needed by the two entries. Do not add a backend registry, plugin loader, alternate scheduler or fake optimized adapter before a second backend exists. Use the existing logger/event publisher and preserve their behavior.
4. Run the targeted test and `npx vitest run src/presentation/stores src/application/usecases src/infrastructure/di --exclude '.worktrees/**' --maxWorkers=2`; expect unchanged normal scheduling/persistence semantics.
5. Commit the three explicit files: `refactor: share video service composition with benchmarks`.

## Task 4 — Separate entries and default-off runtime gate

**Create:** `benchmark/index.html`, `benchmark/run.html`, `src/benchmark/main.ts`, `src/benchmark/run.ts` (minimal entries, no executing UI yet).

**Modify/test:** `vite.config.ts`, `Dockerfile.production`, `scripts/productionServer.mjs`, `scripts/productionServer.spec.ts`, `docker-compose.production.yml`, `scripts/homelabContract.spec.ts`.

1. Extend server/contract tests for default-disabled GET/HEAD on every reserved benchmark route, explicit enablement, malformed paths and unknown nested routes, no-cache documents, capability response, unchanged SPA/health/assets, and the one allowed Compose environment entry. Check client initialization cannot create dependencies before enablement. The existing test currently forbids every environment entry; replace that with an exact allowed contract, not removal of environment checks.
2. Run `npx vitest run scripts/productionServer.spec.ts scripts/homelabContract.spec.ts --exclude '.worktrees/**'`; expect new route/flag assertions to fail.
3. Add Vite 7 `build.rollupOptions.input` for existing `index.html`, `benchmark/index.html`, and `benchmark/run.html`. Preserve targets/base. Map `/benchmark/` to its entry and `/benchmark/run.html` to the host only when enabled; use `/benchmark/capabilities` for the minimal no-store capability/build identity response. Reserve disabled/unknown benchmark routes before extensionless SPA fallback. `createProductionServer({ distRoot, benchmarkEnabled = false })` receives exact boolean enablement from `process.env.BVR_BENCHMARK_ENABLED === 'true'` at the entrypoint. No query/Host/client toggle enables it. Add the matching dev middleware response without a router dependency. Do not import benchmark code from normal `main.ts`.

   Compose's sole new runtime configuration is:

   ```yaml
   environment:
     BVR_BENCHMARK_ENABLED: ${BVR_BENCHMARK_ENABLED:-false}
   ```

   Generate `dist/benchmark/build-identity.json` in Vite output, using the source revision/dirty flag and deterministic hashes of sorted emitted asset names/bytes (excluding the identity artifact itself); keep absolute paths out. The production capability response reads that artifact. `.dockerignore` excludes `.git`, and `VCS_REF` is currently declared only in the runtime stage: add the same `ARG VCS_REF` to the build stage and pass it as `BVR_BUILD_REVISION` to the existing build command. Preserve the runtime OCI revision label and CI's exact-SHA input. Locally obtain revision/dirty state from Git when available, otherwise label it unknown. Dev/dirty/local identity is explicitly unqualified; a source revision field alone is not CI provenance. No timestamps/randomness in the build fingerprint. Add tests to `scripts/homelabContract.spec.ts` for build-argument wiring, stable identity and changed-asset detection. This remains one immutable image with runtime availability, not separate preprod compilation.
4. Rerun targeted tests, then `npm run build`; inspect both HTML entries, content types, absence of benchmark entry imports in normal startup, and disabled/enabled production-server behavior. Do not use Vite preview as proof of the runtime gate.
5. Commit this task's explicit files: `feat: add default-off video benchmark entrypoints`.

## Task 5 — Trial host and serial suite lifecycle

**Create:** `src/benchmark/VideoBenchmarkTrial.vue`, `src/benchmark/runVideoBenchmarkSuite.ts`, `src/benchmark/runVideoBenchmarkSuite.spec.ts`, `src/benchmark/videoBenchmarkHost.ts`, `src/benchmark/videoBenchmarkHost.spec.ts`.

**Modify:** `src/benchmark/run.ts` and shared protocol/tests from Task 1 for the exact typed/JSDoc message union.

1. Add tests for origin/source/ID validation, late/duplicate messages, a second Start while active, cross-tab lock contention, fresh/cached storage pairing with fresh hosts, and Stop admitting no new trials. Deferred foreground plus preview fixtures must prove that foreground-promise resolution is not terminal. Deferred cleanup must prevent the next trial; failure/timeout must retain a row and halt the suite. Check that full report/output rendering happens after timing.
2. Run `npx vitest run src/benchmark/runVideoBenchmarkSuite.spec.ts src/benchmark/videoBenchmarkHost.spec.ts src/shared/benchmark/videoBenchmarkProtocol.spec.ts --exclude '.worktrees/**'`; observe assertion failures.
3. Implement the narrow parent/host lifecycle and visible host component. In `run.ts`, create the services with the pair's benchmark connection, provide them under the existing injection keys and install a fresh Pinia before mounting. The host component's `setup` calls the real `useVideoStore`. Convert selected Files to the existing FileList interface using native `DataTransfer` only after capability qualification. Set existing concurrency overrides and call `addVideosFromFiles`; watch terminal foreground/preview/attempt state rather than reading/stringifying full reports repeatedly. Use a monotonic wall timer around pipeline execution; stop it before output checks or rendering.

   The essential ordering is:

   ```ts
   for (const pair of pairs) {
     const pairId = crypto.randomUUID()
     try {
       for (const cache of includeCached ? ['fresh', 'cached'] : ['fresh']) {
         if (stopRequested()) break
         const host = await createTrialHost({ pairId, cache, configuration: pair })
         try {
           rows.push(await host.runToTerminal(files))
         } finally {
           await host.closeAfterSettlement()
         }
       }
     } finally {
       await deleteOwnedPairDatabase(pairId)
     }
     if (stopRequested()) break
   }
   ```

   Surround this with `navigator.locks.request('bvr-video-benchmark-v1', { ifAvailable: true }, ...)`; no lock means no run. Retain the lock until cleanup settles. Validate the complete protocol and retain failure/cleanup rows even when an exception interrupts the sketch above. Initial explicit limits: 15s host startup, 120s trial, 10s cleanup; record them and treat exceeding them as invalid/incomplete, not an app timeout-policy change. No silent automatic retry.

   After full settlement, collect the report and bounded output descriptors. For visual inspection, optionally return the latest set of thumbnail Blobs separately from the JSON report (maximum 16 MiB; an exceeded display cap must not truncate correctness counts or create a passing result). Unregister only this trial's session files/URLs, dispose the store/app, close its DB and remove the iframe. A cached trial starts in a new host with the same pair DB. On uncertain settlement, retire the host, attempt only exact owned DB cleanup, halt further admission and report whether cleanup remains unresolved. Do not promise rollback of writes or implement foreground cancellation here.
4. Rerun targeted tests, then the existing ingestion/preview scheduler tests. Require no new normal-store behavior change; if terminal observation genuinely needs an additional store accessor, document/review that minimal contract before implementing it.
5. Commit only this task's files: `feat: run isolated sequential video benchmark trials`.

## Task 6 — Operator controls, results and fixture preflight

**Create:** `src/benchmark/VideoBenchmarkView.vue`, `src/benchmark/VideoBenchmarkView.spec.ts`.

**Modify/test:** `src/benchmark/main.ts`, shared protocol/tests for redaction/output validation.

1. Test fixed-fixture selection and canonical ordering, a wrong-size/missing/extra/ambiguous file, disabled Start until capable/valid, bounds on repetitions/settings, DOM-only backend choices, Stop wording, failed/incomplete badges, median/range grouped by configuration/cache, output validation and redacted download. Prevent form changes mid-suite. Test a tab becoming hidden makes its trial ineligible for a comparable summary.
2. Run `npx vitest run src/benchmark/VideoBenchmarkView.spec.ts src/shared/benchmark/videoBenchmarkProtocol.spec.ts --exclude '.worktrees/**'`; expect the new behavior assertions to fail.
3. Build the small view with native form controls, a compact results table and explicit download. No charting, router or UI library. Retain selected File objects once; perform name/size/multiplicity validation outside timing, show `selection-only` verification prominently, and never call `file.arrayBuffer()` on the entire large source. Display manifest expected hashes as expectations, not actual verified file hashes.

   Render only the most recent completed output set for inspection; release its image URLs/Blobs before the next trial and on navigation. Preserve small result rows up to the defined matrix cap. Report phase totals as elapsed operation totals, missing memory/interaction metrics as unavailable, and cache scope as fresh DB/fresh host/shared browser and OS. First-version comparisons across concurrency are valid only within that scope; WebCodecs remains unavailable.
4. Rerun targeted tests, then `npm run lint` and `npm run type-check`, sequentially. Verify the normal `App.vue`/gallery entry does not import the view or create benchmark state.
5. Commit the explicit files: `feat: expose local video benchmark controls and reports`.

## Task 7 — CLI reuse and actual-browser qualification

**Modify/test:** `scripts/videoProcessingBenchmark.mjs`, `scripts/videoProcessingBenchmark.spec.ts`.

**Create:** `cypress/e2e/videoBenchmark.cy.ts`.

**Modify:** `docs/testing/video-processing-performance.md`, `docs/backlog.md`; add a concise native-page procedure to the performance document.

1. Add tests for an explicit `--view pipeline` CLI mode, default legacy-mode preservation, v2 export validation, streaming full-fixture SHA-256 verification before timing, mismatched page/build/backend identities, missing/failed/duplicate rows and error-preserving cleanup. Add real-browser tests that seed a sentinel vote/thumbnail in the normal catalog, run and stop benchmark suites, reload both entries and prove that sentinel remains unchanged. Spy on benchmark-origin IndexedDB operations to prove they never target `VideoMetaDataDB`; a mock-only check is insufficient.
2. Run `npx vitest run scripts/videoProcessingBenchmark.spec.ts --exclude '.worktrees/**'`; observe the new mode/identity assertions fail. Run the new E2E spec against the built production server and observe its expected missing behavior before completing the wiring.
3. Extend the CLI using existing native file-input/CDP infrastructure. Pipeline mode delegates suite ordering to the page and collects its versioned result; do not create nested Node and page matrix schedulers. Keep loopback URL restrictions and disposable profiles, add `sha256-verified` identity only from the runner's actual streaming checks, and retain browser process sampling as separate runner evidence. Legacy full-gallery mode and saved 120-row evidence remain untouched and separately labeled. Node-only code never enters the browser bundle.
4. Qualify with these checks, one heavy command at a time:

   - `npm run lint`
   - `npm run type-check`
   - `npx tsc --noEmit -p cypress/e2e/tsconfig.json`
   - `npm run test:unit`
   - `npm run test:ci`
   - `npm run build`

   Start the built local runtime with `BVR_BENCHMARK_ENABLED=true HOST=127.0.0.1 PORT=4173 node scripts/productionServer.mjs` in a tracked task-owned process. Against it run `npx cypress run --e2e --browser chrome --spec cypress/e2e/videoBenchmark.cy.ts`, then the equivalent Edge command, then existing `cypress/e2e/example.cy.ts` in both browsers. Use only disposable test profiles/catalogs. Confirm default-disabled behavior separately without the flag. Missing browsers are an explicit qualification gap, not a pass.

   Run a DOM-only fixed-fixture pilot and then five comparable fresh/cached pairs at 2/1 in each browser, sequentially, using the new pipeline view mode. Full matrix reruns are optional after the narrow harness is qualified, not a reason to delay a useful first native handoff. Verify expected 7 videos/63 frames for fresh and persistence reuse for cached trials, exact identities, visible-document status, no failed/missing rows and completed resource cleanup. These establish a new page baseline, not a throughput improvement over the old gallery baseline. Automated smoke clips remain distinct from reference performance fixtures.

   Request independent architecture/storage/protocol review with @requesting-code-review, address findings and rerun affected checks. Check output images in the browser for orientation/aspect/time selection. Native user page acceptance remains distinct from headless results. No implementation completion claim while isolation or real-browser lifecycle tests fail.
5. Commit only the task's files: `test: qualify video benchmark page and automation`. Record actual results, revisions and limitations without overwriting the original baseline or marking WebCodecs implemented. Publishing/CI and a live preprod release require the corresponding execution authorization; no automatic squash/merge.

## Feature acceptance and later experiment

When preprod deployment is authorized, first verify the controller's supported runtime flag mechanism. Any required platform repo/config change must be explicitly scoped; do not deploy an image with a disabled page and claim native benchmark availability. Publish the reviewed feature SHA, require exact successful CI, deploy its immutable digest to existing preprod and preserve rollback/operator data. Exercise enabled benchmark entry plus normal-app smoke there before integration.

Native handoff: open the enabled page in Chrome or Edge, select the fixed fixture folder, run the default five pairs with competing work closed, inspect completed thumbnails/results, export JSON if requested, then return to the normal app to check existing votes/previews. Warn that only a user-selected folder is read and no video is uploaded. Do not ask the user to wipe their real catalog or repeat the entire historical matrix.

Only after this harness is qualified, plan the bounded DOM-seek investigation and MP4/H.264 WebCodecs/demuxer prototype. Any new dependency requires an explicit choice/approval. A later prototype adds a real second backend through the existing infrastructure/application boundaries, with correct backend/fallback reporting; it does not get a fake performance slot in this feature.
