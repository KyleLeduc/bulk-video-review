# Dependency Security Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove current dependency vulnerabilities in reviewable batches while preserving application, worktree and production behavior.

**Architecture:** Keep dependency maintenance separate from video-processing changes. Refresh compatible transitive packages first, then coordinate supported build/test versions; independently qualify parent upgrades that remove obsolete dependencies. The final production image contains built assets and a Node-built-in-only server, not `node_modules`, but build/test dependencies still create supply-chain and development exposure.

**Tech Stack:** Vue 3, Pinia 2, Vite, Vitest with matching V8 coverage, happy-dom, Cypress, TypeScript/vue-tsc; Node 22 in CI and Node 24 locally.

---

## Baseline and constraints

- Base: `0f0dd402dbd2301526f20ce8a2425fe7aebc8d25`; docs published, CI `33933915279` passed.
- Unchanged local baseline: 40 files / 290 tests passed on Node 24.19.0.
- Initial npm audit: 39 affected package entries (5 critical, 21 high, 12 moderate, 1 low). GitHub separately reports 86 advisory alerts; these are different units and must not be compared as the same metric.
- Full JSON evidence belongs in the ignored task ledger, not the tracked source tree.
- Preserve the primary checkout's devcontainer lockfile edit, all stashes, existing environments and browser catalogs. Use an intentionally private dependency installation in this migration worktree; do not modify the primary `node_modules` through its symlink.
- Run installs, suites, builds and CI sequentially. Never use `npm audit fix --force` or broad overrides to pretend unsupported packages are fixed.
- No preprod release is authorized by this task. Keep Chrome/Edge acceptance open until actually exercised; the configured Chrome binary is currently missing and a representative video corpus has been requested.

## First execution batch

### Task 1: Guard and refresh compatible dependency paths

**Files:** Create `scripts/dependencySecurity.spec.ts`; modify `package-lock.json` only for package updates.

1. Write a lockfile regression test covering every installed copy of shell-quote, form-data, PostCSS and nanoid against the patched floors selected below. Match nested package paths too; allow a vulnerable dependency to be removed entirely. This is a narrow regression guard, not a replacement for current advisory scanning.
2. Run `npm exec -- vitest run scripts/dependencySecurity.spec.ts --maxWorkers=2 --minWorkers=1 --exclude '.worktrees/**'`; confirm failures identify the old versions.
3. Verify `node_modules` is exactly the worktree symlink to the primary install. Unlink only that symlink, leaving its target untouched.
4. Run `npm update --package-lock-only --ignore-scripts shell-quote @cypress/request form-data postcss nanoid`. Inspect the lockfile diff and parent ranges; do not silently advance unrelated direct major versions.
5. Run an isolated `npm ci --ignore-scripts`, then rerun the guard and the full unit suite. Record an updated `npm audit --json` inventory.
6. After @verification-before-completion, commit only the reviewed plan, guard and lockfile with `chore: refresh compatible security dependencies`.

Selected security floors as of 2026-09-04: shell-quote 1.9.0; form-data 2.5.6 / 4.0.6; PostCSS 8.5.23; nanoid 3.3.18. Prefer compatible newer patches. Cypress 13 permits `@cypress/request@3.0.10`, whose form-data 4 range removes the old form-data 2 path without a Cypress major upgrade.

### Task 2: Coordinate the supported build/test stack

**Files:** Modify `package.json`, `package-lock.json`, `vite.config.ts` and `scripts/dependencySecurity.spec.ts`; change existing tests only when verified migration semantics require it.

1. Add failing regression guards for supported Vite 7.3.6+, Vitest 4.1.11+, happy-dom 20.14.0+ and an exactly matched Vitest/coverage version.
2. Run the targeted test and confirm the old build/test versions fail.
3. Set Vite `^7.3.6`, Vue plugin `^6.0.8`, Vitest and V8 coverage both exactly `4.1.11`, happy-dom `^20.14.0`. Regenerate the lockfile and clean-install with lifecycle scripts disabled.
4. Preserve the existing browser build targets explicitly in `vite.config.ts`: `['chrome87', 'edge88', 'firefox78', 'safari14']`. Vite 7 changes its default targets; dependency maintenance must not silently narrow the existing compatibility contract. Keep loopback-only development binding and the existing alias plugin. Explicitly include `src/**/*.{js,ts,vue}` and `scripts/**/*.{js,mjs,ts}` in coverage so Vitest 4 does not silently omit unimported source files.
5. Review the official version-specific migration guides before adapting configuration, mocks or fake timers. Run targeted tests, `npm run lint`, `npm run type-check`, `npm run test:unit -- --maxWorkers=2`, `npm run test:ci -- --maxWorkers=2`, and `npm run build`, sequentially. Verify Node 22 compatibility through the repository CI or its exact pinned runtime.
6. After verification, commit only the coordinated toolchain and any necessary migration adaptations with `chore: migrate to supported Vite and Vitest releases`.

Vite 7.3 and Vitest 4.1 still receive important/security fixes. These avoid the additional Vite 8 bundler and Vitest 5 behavior migrations while fixing the current vulnerable versions. Recheck support at each future upgrade.

### Task 3: Review results and checkpoint remaining security work

**Files:** Update `docs/backlog.md` and this plan with exact results and unresolved findings.

1. Compare before/after npm inventories using identical audit scope; identify remaining vulnerable parent chains with `npm explain`.
2. Run `npm run worktree -- help` and read-only status/bootstrap checks, preserving shared-install behavior in ordinary worktrees.
3. Use @requesting-code-review for a read-only review of the batch and verification evidence. Resolve real findings and rerun affected checks.
4. Publish the verified feature branch only when the local heavyweight slot is free; monitor required CI. Do not deploy.
5. Report the checkpoint and wait for feedback as required by @executing-plans. Do not mark BVR-001 complete while parent migrations or real-browser acceptance remain open.

## Following batches

- Qualify Cypress 16 and its current Node/browser requirements separately to remove `extract-zip`; run the actual built-app Cypress suite, not just unit mocks.
- Upgrade vue-tsc and its language-core family to remove the obsolete Vue 2 compiler. Keep TypeScript, Vue types and template checking coherent; do not disable diagnostics to pass.
- Address any remaining security fixes in dependency-cruiser, lint/config tools and other parents with the smallest supported migration. Keep Vue/Pinia feature changes and ESLint major/flat-config migration separate unless evidence makes them prerequisites.
- Retest clean installation, lint/types, unit/coverage, build, worktree tooling and browser flows before final integration. Retain the consolidated feature branch after integration; clean worktree/artifacts only under the approved ownership-aware closeout procedure.
- Then follow `2026-09-04-parallel-video-processing.md`, beginning with actual Chrome/Edge timings and measurement instrumentation. No worker-speed claim or concurrency rollout before the baseline and cancellation/drain prerequisites. Demuxer selection remains its own approval gate.

## Primary references

- [Vite supported releases](https://vite.dev/releases) and [Vite 7 migration](https://v7.vite.dev/guide/migration.html).
- [Vitest supported releases](https://main.vitest.dev/releases) and [Vitest security advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp).
- [Version-specific Vitest 4 migration guide](https://github.com/vitest-dev/vitest/blob/v4.1.11/docs/guide/migration.md): changed coverage defaults, mock constructors and test worker options.
- [shell-quote security advisories](https://github.com/ljharb/shell-quote/security).
- npm registry package manifests and fresh `npm audit --json` results captured in the task evidence; advisory state is time-sensitive.

## Execution evidence — first checkpoint

- Compatible refresh: `00fcdc9`; all five lockfile guards first failed on old versions, then passed. Private `npm ci --ignore-scripts`, 295 unit tests, lint, types and build passed. Audit: 34 affected entries, including two critical Vitest/provider entries.
- Supported build/test migration: clean install succeeded, nine lockfile guards passed; lint, type-check, 299 unit tests, 299 coverage tests and production build passed on Node 24.19.0 / npm 11.17.0. No application implementation or assertions changed. Four test files needed explicit Promise/mock types after the new Vitest typings exposed `Promise<unknown>` inference.
- Coverage includes unimported source/scripts, with 72.82% line coverage under the new V8 mapper; this is not directly comparable to old-mapper percentages.
- Full npm audit: 29 affected entries (0 critical, 15 high, 13 moderate, 1 low). Separate `npm audit --omit=dev --json`: zero findings. Remaining chains are recorded under BVR-001; neither result means all security work is complete.
- `npm run worktree -- help` and `npm run worktree -- ps` passed; no dev server was started. Existing bootstrap tests passed in the full suite. The migration checkout has a deliberate private install; primary Vite remains 5.3.1 and its unrelated lockfile edit/stashes were preserved.
- Independent read-only review: no Critical or Important findings. Its minor guard-hardening finding was fixed: unknown leaf majors are rejected and tooling must remain on its qualified major. The nine guards and lint passed after that change. Canonical worktree bootstrap also passed and preserved the private install.
- Exact Node 22 CI execution: pending publication; record the run/commit in the task ledger. Cypress/native Chrome/Edge flows and performance measurements: not run. No preprod deployment.
