# Product and maintenance backlog

Items here are planned work, not implemented behavior. Reassess versions and browser capabilities when starting an item.

## BVR-001 — Upgrade dependencies and modernize the toolchain

**Status:** In progress on `chore/dependency-security-refresh`; first security batches implemented, not yet integrated or deployed. **Priority:** High; remaining security exposure needs follow-up.

**Benefit:** Keep the app supported and reduce dependency/security risk without losing the current filter, ingestion, preview, or worktree behavior.

Start from current `master`. The retired `upgradeDeps` branch (`49da187`) was a December 2025 version/lockfile snapshot, not a completed migration; do not merge its lockfile wholesale.

### 2026-09-04 checkpoint

The [dependency refresh plan](plans/2026-09-04-dependency-security-refresh.md) records a compatible transitive refresh and a coordinated Vite 7.3.6 / Vitest 4.1.11 migration. Vue/Pinia behavior, browser build targets and production persistence contracts are unchanged. Promise types in existing test mocks were made explicit for Vitest's newer inference; assertions were not weakened.

| npm audit scope | Before | After these batches |
|---|---|---|
| All dependency entries | 39: 5 critical, 21 high, 12 moderate, 1 low | 29: 0 critical, 15 high, 13 moderate, 1 low |
| Production dependencies only | Not separately captured | 0 findings |

These are affected package entries, not GitHub's separate advisory-alert count. The deployed image does not contain `node_modules`, but build/test vulnerabilities still matter. The remaining 29 findings are unresolved, not accepted exceptions.

Owner: repository maintenance/BVR-001. Next batches must cover Cypress's `extract-zip`, request/uuid/qs chain; vue-tsc's obsolete Vue 2 compiler chain; tsx's older esbuild; and compatible security patches in the remaining build/lint tools. Reassess parent versions and advisories when each batch starts. Native Chrome/Edge acceptance remains open; no working configured Chrome executable or representative video corpus was available at this checkpoint.

Local checks on Node 24.19.0: private clean install, lint, type-check, 299 unit tests, the same 299 tests with V8 coverage, production build, and worktree CLI help/status passed. CI Node 22 and reviewer results are recorded in the implementation plan when available. This is not completion of the broader modernization or browser acceptance.

### Scope

- Inventory resolved dependencies, Node/npm requirements, current advisories and GitHub dependency alerts. Separate runtime exposure, development-only exposure, and deployment-image findings; do not assume an image scan covers the JavaScript dependency graph.
- Select supported targets from the maintainers' current migration guides at implementation time. Record compatibility and security rationale, rather than adopting the retired branch's old version choices.
- Upgrade in reviewable groups: Vue/Pinia; Vite/Vue plugin/TypeScript/vue-tsc; Vitest and its matching coverage provider; ESLint/Vue/TypeScript/Cypress lint plugins; Cypress and related tooling.
- Migrate the legacy `.eslintrc.cjs` configuration and lint command if the selected ESLint version requires flat config. Coordinate Vitest with `@vitest/coverage-v8`, `happy-dom`, aliases, and test configuration.
- Preserve current worktree scripts, shared dependencies/environment links, coverage exclusions, ingestion tests, and production worker-asset compatibility. Regenerate `package-lock.json` from the updated manifest using the chosen supported runtime.
- Keep application behavior changes and video-worker implementation out of the dependency-only commits. No blanket forced audit fixes or unrelated library substitutions.

### Acceptance

- [ ] Document before/after dependency and advisory inventories, resolved findings, and justified remaining risks with owners/follow-ups.
- [ ] A clean `npm ci` works on the selected local/devcontainer and CI Node/npm versions; manifest and lockfile agree.
- [ ] `npm run lint`, `npm run type-check`, `npm run test:unit`, `npm run test:ci`, and `npm run build` pass, sequentially.
- [ ] `npm run test:e2e` passes against the built app; Chrome and Edge browser checks cover filters, imports, duplicate/retry handling, preview persistence, voting/pinning, and playback.
- [ ] `npm run worktree -- help` and isolated worktree bootstrap/status checks pass. Ordinary worktrees retain shared dependencies; a dependency-migration worktree may intentionally use a private install to protect the primary checkout. No second development container.
- [ ] Required CI/security checks pass; a separately authorized immutable preprod release passes the existing smoke runbook. Browser acceptance remains distinct from infrastructure smoke.

## BVR-002 — Parallel video ingestion and thumbnail processing

**Status:** Proposed design and implementation plan; no implementation started.

**Benefit:** Import batches and generate previews faster while keeping filtering, scrolling, voting, and playback responsive.

**Target:** Chrome/Edge first for measurement and qualification, as confirmed on 2026-09-04; this is not a user-agent allowlist. Retain the existing browser path for unsupported capabilities/codecs and opt-out. Worker image encoding may run over HTTP; worker WebCodecs decoding requires a secure context. Keep all video processing local to the browser.

- Measure current metadata, seeking, encoding, and persistence costs before changing concurrency.
- Introduce a bounded dedicated-worker pool and OffscreenCanvas image processing; then evaluate container demuxing and WebCodecs decoding in workers for metadata/covers and preview frames.
- Preserve identity, database format, object-URL ownership, foreground priority, cancellation, and preview transaction boundaries.
- Treat cross-origin isolation/threaded WASM as a separate, evidence-gated option, not a prerequisite for ordinary workers or WebCodecs.

See the [design](plans/2026-09-04-parallel-video-processing-design.md) and [implementation plan](plans/2026-09-04-parallel-video-processing.md). The dependency refresh is separately deliverable; only a demonstrated tooling/security prerequisite should block the first worker phase.
