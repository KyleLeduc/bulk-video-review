# Dependency refresh qualification — 2026-09-04

## Scope

Branch: `chore/dependency-security-refresh`, based on `0f0dd40`. This is a
dependency/security qualification, not a preprod deployment or a video-worker
performance result. Keep the existing Vue/Pinia runtime, browser build targets,
database version, IDs, and preview format.

Resolved qualification targets: Vite 7.3.6, plugin-vue 6.0.8, Vitest and V8
coverage 4.1.11, happy-dom 20.14.0, tsx 4.23.13, dependency-cruiser 16.10.4,
vue-tsc 3.3.11, Cypress 16.0.0. TypeScript remains 5.5.2.

Full `npm audit --json` affected-entry progression: **39 → 34 → 29 → 8 → 5 → 0**.
The final full JSON has an empty vulnerability map. This is a point-in-time npm
advisory result, not a claim that every dependency is current or free from
unknown vulnerabilities. GitHub default-branch alerts are a different metric
and are not closed merely by publishing a feature branch. Broader ESLint flat
config/framework modernization remains under BVR-001.

## Repeatable local checks

Use Node 22.12+ on the qualified Node 22 line, or Node 24. The host qualification
uses Node 24.19.0 / npm 11.17.0; browser tests use Node 24.20.0. Run sequentially:

```sh
npm ci --ignore-scripts
npm run lint
npm run type-check
npm exec -- tsc --noEmit -p cypress/e2e/tsconfig.json
npm run test:unit -- --maxWorkers=2
npm run test:ci -- --maxWorkers=2
npm run build
npm run worktree -- help
npm run worktree -- ps
npm audit --json
```

`--ignore-scripts` intentionally skips Cypress binary download and Husky; install
the locked Cypress binary explicitly inside the disposable browser environment.
Ordinary worktrees use the repository bootstrap's shared installation. This
migration worktree deliberately has a private install so it cannot mutate the
primary checkout's older dependencies.

## Chrome and Edge smoke

Use an isolated browser profile/catalog, never the operator's preprod profile.
The checked-in 6,980-byte [synthetic fixtures](../../cypress/fixtures/videos/README.md)
exercise actual metadata decoding, canvas encoding, IndexedDB and H.264 playback.
There are no media/parser/worker mocks or uncaught-exception suppressions.

```sh
npm exec -- cypress install
npm run test:e2e
npm exec -- start-server-and-test preview :4173 'cypress run --e2e --browser edge'
```

`npm run test:e2e` defaults to Chrome; `--browser edge` explicitly overrides it.
The app is served from built `dist` on container loopback, not a live environment.

The qualification environment is the official `cypress/browsers` image pinned at
manifest digest
`sha256:4e487953a62c66c9b0ba84e07ecc84089612e213718b2a76c13c98ca66f97bae`
(tag `node-24.20.0-chrome-152.0.7977.64-1-ff-155.0-edge-152.0.4191.53-1`).
Actual browser versions: Chrome **152.0.7977.64**, Edge **152.0.4191.53**;
Cypress **16.0.0**. One task-labelled, disposable container has a sole worktree
bind, 2 CPU / 4 GiB memory / 1 GiB shared memory, no Docker socket, named volumes,
operator profiles, or published host ports. Cypress cache lives inside its
disposable filesystem. This is not another development container.

The smoke covers empty navigation, filter hide/inert state, actual duplicate
file import, ready previews, minute range limits/non-crossing keyboard controls,
title/pin filtering, playback/seek, votes, clear-unpinned, reload/reselection
with persisted previews and votes, and failed-file retry classification. Cypress
synthetic mouse clicks do not establish CSS hover; the test uses keyboard focus
to expose playback controls and pins with the player controls already visible.
Do not claim native pointer-hover or drag feel from this smoke.

## Failures uncovered and repaired

- The old E2E tsconfig extended removed `@vue/tsconfig/tsconfig.web.json`.
  The installed `tsconfig.dom.json` allows preprocessing to reach the app.
- The only old E2E assertion expected the removed Vue starter heading
  `You did it!`; the real workflow replaces it.
- Real Chrome found a playback AbortError: `VideoEmbed` directly assigned the
  registry source, called `play()`, then Vue patched reactive `src` again.
  A unit ordering regression reproduced this. The separately committed repair
  lets Vue bind `src` before autoplay, checks the element still exists after the
  tick, and settles play rejections. Expected AbortError interruptions are
  handled; other failures are logged. URL release stays in the existing
  unmount path. See [Vue DOM flush semantics](https://vuejs.org/api/general#nexttick)
  and [Chrome's play interruption explanation](https://developer.chrome.com/blog/play-request-was-interrupted).

## Evidence status

- Final local qualification: private clean install, lint, app/Cypress types,
  **306 unit tests**, the same **306 coverage tests**, build, and canonical
  worktree help/status/bootstrap passed. Coverage: **72.88% lines** with the
  explicit all-source/scripts inclusion. Full and production-only npm audits: 0.
- Chrome and Edge each passed the complete smoke twice after workflow corrections;
  final runs were 5.266 s and 5.989 s respectively. These are test durations,
  **not performance benchmark measurements**. The 17 targeted dependency/playback
  regressions also passed after final review hardening.
- Independent read-only review found no remaining Critical, Important or Minor
  issues. It prompted a retryable image-decode assertion and a non-vacuous source
  ordering assertion. Exact published Node 22 CI is the remaining integration
  gate; record its SHA/run in the task ledger and handoff, rather than inferring
  CI from these local results. Existing CI runs unit/build/image checks, not this
  Chrome/Edge E2E suite.
- No merge or preprod deployment. Human browser acceptance and the fixed,
  representative Chrome/Edge performance corpus remain open. The synthetic
  fixture run cannot justify worker defaults or speedup claims.
