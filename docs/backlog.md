# Product and maintenance backlog

Individual statuses distinguish planned work, verified branch changes and integrated behavior. Reassess versions and browser capabilities when starting an item.

## BVR-001 — Upgrade dependencies and modernize the toolchain

**Status:** Security refresh and Chrome/Edge smoke implemented on `chore/dependency-security-refresh`; not yet integrated or deployed. Broader modernization remains open. **Priority:** High; integrate the verified security refresh.

**Benefit:** Keep the app supported and reduce dependency/security risk without losing the current filter, ingestion, preview, or worktree behavior.

Start from current `master`. The retired `upgradeDeps` branch (`49da187`) was a December 2025 version/lockfile snapshot, not a completed migration; do not merge its lockfile wholesale.

### 2026-09-04 checkpoint

The [dependency refresh plan](plans/2026-09-04-dependency-security-refresh.md) and [qualification evidence](testing/dependency-refresh.md) record compatible transitive fixes, Vite 7.3.6 / Vitest 4.1.11, vue-tsc 3.3.11 and Cypress 16.0.0. Vue/Pinia versions, browser build targets and persistence contracts are unchanged. Real browser acceptance also exposed a source-binding/playback race; its small repair and regression tests are a separate commit from dependency changes.

| npm audit scope | Before | After these batches |
|---|---|---|
| All dependency entries | 39: 5 critical, 21 high, 12 moderate, 1 low | 0 findings |
| Production dependencies only | Not separately captured | 0 findings |

These are affected package entries, not GitHub's separate advisory-alert count. The deployed image does not contain `node_modules`, but build/test vulnerabilities still matter. Zero is a point-in-time audit result, not a blanket security guarantee or proof that default-branch alerts have closed.

Owner: repository maintenance/BVR-001. The vulnerable Cypress/archive/request, obsolete Vue 2 compiler, tsx/esbuild and remaining compatible tooling chains were remediated without forced leaf overrides. Follow-up modernization includes ESLint flat config and coordinated framework/type/lint maintenance, selected from current support needs rather than the retired branch. Headless real Chrome and Edge smoke passed in a disposable official browser-test container. Human pointer/drag feel and representative performance measurements remain open.

Local checks on Node 24.19.0: private clean install, lint, app/Cypress types, 306 unit tests, the same 306 tests with V8 coverage, production build, and worktree CLI help/status/bootstrap passed. Chrome/Edge on Node 24.20.0 exercised real imports, duplicate selection, previews, range filtering, voting/pinning, playback/seek, reload/reselection persistence and invalid-file retry classification. Independent review found no remaining issues. [Exact published Node 22 CI](https://github.com/KyleLeduc/bulk-video-review/actions/runs/33937629494) passed on `922eac2`, including clean install/application checks, Compose validation and production image build/scan/runtime smoke. No preprod deployment; infrastructure smoke does not replace browser acceptance.

### Scope

- Inventory resolved dependencies, Node/npm requirements, current advisories and GitHub dependency alerts. Separate runtime exposure, development-only exposure, and deployment-image findings; do not assume an image scan covers the JavaScript dependency graph.
- Select supported targets from the maintainers' current migration guides at implementation time. Record compatibility and security rationale, rather than adopting the retired branch's old version choices.
- Upgrade in reviewable groups: Vue/Pinia; Vite/Vue plugin/TypeScript/vue-tsc; Vitest and its matching coverage provider; ESLint/Vue/TypeScript/Cypress lint plugins; Cypress and related tooling.
- Migrate the legacy `.eslintrc.cjs` configuration and lint command if the selected ESLint version requires flat config. Coordinate Vitest with `@vitest/coverage-v8`, `happy-dom`, aliases, and test configuration.
- Preserve current worktree scripts, shared dependencies/environment links, coverage exclusions, ingestion tests, and production worker-asset compatibility. Regenerate `package-lock.json` from the updated manifest using the chosen supported runtime.
- Keep application behavior changes and video-worker implementation out of the dependency-only commits. No blanket forced audit fixes or unrelated library substitutions.

### Acceptance

- [x] Document before/after dependency and advisory inventories, resolved findings, and justified remaining risks with owners/follow-ups.
- [x] A clean `npm ci` works on the selected local/devcontainer and CI Node/npm versions; manifest and lockfile agree.
- [x] `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run test:ci`, and `npm run build` pass, sequentially.
- [x] `npm run test:e2e` passes against the built app; Chrome and Edge browser checks cover filters, imports, duplicate/retry handling, preview persistence, voting/pinning, and playback. This is automated headless smoke, not human pointer/drag acceptance.
- [x] `npm run worktree -- help` and isolated worktree bootstrap/status checks pass. Ordinary worktrees retain shared dependencies; a dependency-migration worktree may intentionally use a private install to protect the primary checkout. No second development container.
- [x] Required CI/security checks pass on the exact published dependency commit.
- [ ] A separately authorized immutable preprod release passes the existing smoke runbook. Browser acceptance remains distinct from infrastructure smoke.

## BVR-002 — Parallel video ingestion and thumbnail processing

**2026-09-05 increment:** The separate dev/preprod [video benchmark view](plans/2026-09-05-video-benchmark-view-design.md) is implemented on `feat/video-benchmark-view`, with isolated databases, serial fresh/cached hosts, output checks and shared CLI validation. Qualification and release evidence are tracked in the [measurement record](testing/video-processing-performance.md#isolated-benchmark-page--2026-09-05). Native acceptance precedes the next bounded seek/frame-extraction experiment. WebCodecs/demuxing and workers remain unimplemented; no throughput improvement is claimed. This supersedes the earlier encoding-worker-first sequence. The checkpoint below describes the original reference publication, not current live deployment state.

**Status:** Measurement-only implementation on `feat/video-processing-measurements`, stacked on the verified dependency-security branch. The full public-reference matrix is complete: 120 validated Chrome/Edge runs, five cold/warm pairs for every configuration. Awaited DOM seeking dominates both processing lanes; encoding alone is not the main throughput cost. No worker implementation, integration or deployment. Personal-workload and native interaction/decoder-memory acceptance remain open.

**Benefit:** Import batches and generate previews faster while keeping filtering, scrolling, voting, and playback responsive.

**Target:** Chrome/Edge first for measurement and qualification, as confirmed on 2026-09-04; this is not a user-agent allowlist. Retain the existing browser path for unsupported capabilities/codecs and opt-out. Worker image encoding may run over HTTP; worker WebCodecs decoding requires a secure context. Keep all video processing local to the browser.

- Measure current metadata, seeking, encoding, and persistence costs before changing concurrency.
- Introduce a bounded dedicated-worker pool and OffscreenCanvas image processing; then evaluate container demuxing and WebCodecs decoding in workers for metadata/covers and preview frames.
- Preserve identity, database format, object-URL ownership, foreground priority, cancellation, and preview transaction boundaries.
- Treat cross-origin isolation/threaded WASM as a separate, evidence-gated option, not a prerequisite for ordinary workers or WebCodecs.

See the [design](plans/2026-09-04-parallel-video-processing-design.md) and [implementation plan](plans/2026-09-04-parallel-video-processing.md). The dependency refresh is separately deliverable; only a demonstrated tooling/security prerequisite should block the first worker phase.

The [measurement task expansion](plans/2026-09-04-video-processing-measurements.md), [reference baseline plan](plans/2026-09-04-video-reference-baseline.md) and [measurement protocol/evidence](testing/video-processing-performance.md) cover actual phase timings, session/attempt attribution, the opt-in UI probe and the public reference matrix. [Instrumentation CI](https://github.com/KyleLeduc/bulk-video-review/actions/runs/33939820707) passed on `00b7646`. Synthetic smoke qualifies instrumentation only. Reference throughput, proxy responsiveness/RSS observations and native acceptance are separate evidence levels; keep unmet gates explicit before introducing workers.

The reference matrix found cold pipeline medians of 23.814–27.810s in Chrome and 25.196–27.737s in Edge for this fixed 654 MB selection. More concurrency was not monotonically faster; no automatic defaults changed. Keep bounded image workers focused on demonstrable responsiveness, and investigate seeking/frame extraction separately for throughput. Detailed spread, sampled-memory limitations and all pilot exclusions are in the evidence record.
