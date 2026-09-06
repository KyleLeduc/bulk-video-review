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

**2026-09-05 current increment:** The separate dev/preprod [video benchmark view](plans/2026-09-05-video-benchmark-view-design.md) is implemented on `feat/video-benchmark-view`. Four [native custom DOM suites](testing/video-processing-performance.md#native-custom-dom-concurrency--2026-09-05) now document the owner's 2/1 → 2/2 → 2/1 → 2/2 comparison: later fresh 2/2 processing repeatedly averages about 9.45 seconds, versus about 11 seconds at 2/1. The failed/backgrounded A2 suite is retained and excluded from qualified summaries. This is a workload-specific existing-concurrency result, not an implemented optimization or a new default.

**2026-09-05 experiment checkpoint:** The owner approved a [revised custom-file extraction-only scope](plans/2026-09-05-custom-mediabunny-benchmark.md) after the [source audit](testing/mediabunny-qualification.md), accepting its lack of hard parser-memory bounds. Pinned Mediabunny 1.55.7 was privately installed and the separate DOM/WebCodecs worker comparison implemented; see [operator instructions](testing/custom-mediabunny-benchmark.md). No fixtures were needed on the owner PC. Native custom-file timing and image results were the next evidence gate; no throughput win or normal-app enablement was claimed. MP4Box.js remained an uninstalled follow-up, not assumed to pass the same source gate. Native Edge/frame-image/decoder-memory acceptance, production safety requirements and final integration were open at this checkpoint.

**2026-09-06 owner evidence update:** Custom NAS still-extraction results favor DOM at the tested settings. The subsequent plan runner and 3-second clip experiment produced successful local/NAS reports on build `5dc829ff918065e770442ee31c225be1dbce9f82`; the owner considers motion-preview quality a substantial improvement. Track that separate product benefit in [BVR-003](#bvr-003--mediabunny-motion-previews). The owner has enough evidence to justify a second adapter; further speed benchmarking is deferred until this feature is merged to master. These results do not establish a browser-threading bottleneck or enable Mediabunny in normal ingestion.

**Historical reference checkpoint:** Measurement-only implementation on `feat/video-processing-measurements`, stacked on the verified dependency-security branch. The full public-reference matrix is complete: 120 validated Chrome/Edge runs, five cold/warm pairs for every configuration. Awaited DOM seeking dominates both processing lanes; encoding alone is not the main throughput cost. At that checkpoint there was no worker implementation, integration or deployment, and personal-workload/native acceptance was still pending. This is not a statement of current live deployment state.

**Benefit:** Import batches and generate previews faster while keeping filtering, scrolling, voting, and playback responsive.

**Target:** Chrome/Edge first for measurement and qualification, as confirmed on 2026-09-04; this is not a user-agent allowlist. Retain the existing browser path for unsupported capabilities/codecs and opt-out. Worker image encoding may run over HTTP; worker WebCodecs decoding requires a secure context. Keep all video processing local to the browser.

- Measure current metadata, seeking, encoding, and persistence costs before changing concurrency.
- Next qualify bounded demuxing/WebCodecs preview extraction in the isolated benchmark; defer foreground metadata/covers and a broader worker pool until the narrower experiment produces evidence.
- Preserve identity, database format, object-URL ownership, foreground priority, cancellation, and preview transaction boundaries.
- Treat cross-origin isolation/threaded WASM as a separate, evidence-gated option, not a prerequisite for ordinary workers or WebCodecs.

See the [design](plans/2026-09-04-parallel-video-processing-design.md) and [implementation plan](plans/2026-09-04-parallel-video-processing.md). The dependency refresh is separately deliverable; only a demonstrated tooling/security prerequisite should block the first worker phase.

The [measurement task expansion](plans/2026-09-04-video-processing-measurements.md), [reference baseline plan](plans/2026-09-04-video-reference-baseline.md) and [measurement protocol/evidence](testing/video-processing-performance.md) cover actual phase timings, session/attempt attribution, the opt-in UI probe and the public reference matrix. [Instrumentation CI](https://github.com/KyleLeduc/bulk-video-review/actions/runs/33939820707) passed on `00b7646`. Synthetic smoke qualifies instrumentation only. Reference throughput, proxy responsiveness/RSS observations and native acceptance are separate evidence levels; keep unmet gates explicit before introducing workers.

The reference matrix found cold pipeline medians of 23.814–27.810s in Chrome and 25.196–27.737s in Edge for this fixed 654 MB selection. More concurrency was not monotonically faster; no automatic defaults changed. Keep bounded image workers focused on demonstrable responsiveness, and investigate seeking/frame extraction separately for throughput. Detailed spread, sampled-memory limitations and all pilot exclusions are in the evidence record.

## BVR-003 — Mediabunny motion previews

**Status:** Product integration remains proposed. The owner has accepted the experimental 3-second approach and a second adapter's value. The current branch adds a benchmark-only 10/20/24/30 FPS quality plan and one muted, noninteractive cycling player with external playback controls. Normal gallery integration and clip persistence remain open. See the [focus/clip smoke checkpoint](testing/ingestion-clip-ux-smoke.md). **Priority:** Preview quality and ingestion reliability; more speed evidence is deferred until master integration.

**Benefit:** Replace the discontinuous still-thumbnail preview loop with short motion segments that make videos easier to assess. Include Mediabunny for this capability without requiring it to outperform DOM still extraction.

### 2026-09-06 evidence

Owner-supplied `clips-3s-v1` reports on build `5dc829ff918065e770442ee31c225be1dbce9f82`, Mediabunny 1.55.7: one job, up to ten 3-second clips per file, 10 FPS, 320-pixel maximum dimension, 250 kbit/s target bitrate, muted AVC/MP4 output. Both selections completed all 20 files and produced 200 clips.

| Measurement | Local disk | Wired NAS |
|---|---|---|
| Whole extraction batch | 50.64 s | 65.68 s |
| Mean per-file extraction wall time | 2.53 s | 3.28 s |
| Sum of reported read waits | 5.84 s | 50.01 s |
| Aggregate clip output | 16.50 MB | 16.50 MB |

NAS took 15.04 seconds longer, or 29.7% more time; local disk reduced batch time by 22.9%. Output averaged about 82.5 kB per clip / 825 kB per source file (decimal units). This is useful quality/cost evidence, not a controlled storage benchmark: only one pass per storage type, different selection order, shared caches, selection-only identity rather than content verification, and differing application-requested read volumes (1.963 GB local versus 1.325 GB NAS, not measured network traffic). Read waits are included in setup/conversion timings and can overlap other work; do not add them to those phases or treat the remainder as CPU time. Matching file ordinals across these selections is invalid.

The 65.68-second NAS clip batch was shorter than the earlier 100-still NAS mean batch times (DOM approximately 129–138 seconds; Mediabunny 160–209 seconds), but longer than the 9-still mean batch times (DOM approximately 9–11 seconds; Mediabunny 12–17 seconds). Those older runs used a different build and 2/4 jobs rather than one, so they do not establish an apples-to-apples clips-versus-stills speedup. Storage wait evidence also does not establish a single-threaded-browser bottleneck.

### Local nine-still follow-up

Subsequent owner reports on the same build use one job and one repetition, matching clip concurrency. Both still runs share selection `ebfe6336-7932-407b-bb7a-2559ffdfa968` and file order; all 20 files passed with nine stills each. The earlier local clip selection has the same ordered sizes but a different selection ID, not verified content identity.

| Local workload per file | Batch time, 20 files | Application-requested bytes | Read calls |
|---|---|---|---|
| Nine stills, direct reader | 12.5508 s | 448,283,124 | 18,957 |
| Nine stills, buffered 1 MiB reader | 10.2560 s | 941,658,548 | 886 |
| Ten 3-second clips, buffered reader | 50.6426 s | 1,962,971,572 | 1,860 |

Clips took 4.04 times the direct-still batch time and 4.94 times the buffered-still batch time: they are not faster for this nine-still comparison. Their quality benefit is much more motion content: ten 3-second clips at 10 FPS represent approximately 300 output frames per source, versus nine stills. Output-frame counts do not measure equal seeking, decoding or encoding work; do not extrapolate a same-work throughput advantage or local 100-still timing from them.

Buffering reduced the observed still batch time by 18.3% (2.29 seconds), with 95.3% fewer read calls but 2.10 times the application-requested bytes. This is consistent with a fewer/larger-read tradeoff, not proof that buffering always wins. Both modes are single-pass measurements with shared caches; still metadata preparation is outside batch timing (approximately 0.20 seconds per selection), while clip setup is included. A local DOM nine-still, one-job result would complete the same-concurrency backend comparison; the optional reversed-pass plan remains useful for repeatability.

### Proposed scope

- Preserve the existing DOM metadata/cover/still path for immediate results and fallback. Generate motion previews as bounded, lower-priority background enrichment; defer replacing all still extraction or introducing a general worker pool.
- Retain 3-second segments and up to ten duration-appropriate positions across the source. Cycle through the clip array in the thumbnail preview loop, with a still fallback while loading or after a failure. Do not change the main video player's controls or interaction.
- Add a one-click quality comparison plan retaining the 10 FPS baseline and trying 20, 24 and 30 FPS at the same duration/dimensions. Record the chosen FPS, bitrate, output bytes, first-clip and batch timing, read costs and failures. Select the production setting after owner visual acceptance on representative motion; a fixed bitrate may keep size similar while reducing detail per frame, so evaluate bitrate separately if needed.
- Make thumbnail playback muted and inline, without native controls, native click-to-pause/seek, keyboard focus, picture-in-picture or fullscreen affordances. Preview media must not intercept the gallery card's existing selection/open actions. Pause offscreen/hidden previews, bound simultaneous playback and preserve an accessible still/reduced-motion option.
- Keep extraction browser-local and capability-gated, with explicit cancellation, foreground priority and existing source-identity/object-URL ownership rules. Reassess parser/decoder memory risks from the source audit before normal-app enablement. Preserve read, duration, output and deadline limits; reported byte limits are not hard decoder-memory bounds.
- Define versioned clip storage and quota/eviction behavior before adding persistence. Interrupted extraction, unsupported codecs, storage exhaustion or stale results must leave existing previews usable. Current owner evidence qualifies AVC/MP4 output only; qualify WebM fallback separately rather than assuming every Mediabunny-supported format works.
- Retain concise, privacy-safe failure stage/reason diagnostics. Richer failure metadata and embedded dates with explicit provenance are lower-priority follow-ups; embedded dates must not be presented as download dates or confused with filesystem `lastModified` / app-added time. FFmpeg WASM remains deferred.

### Next measurement and acceptance

- [x] Add the benchmark-only quality plan, single cycling player, external playback controls and coherent shared/automatic/manual sections; automated and native Chrome/Edge correctness coverage is recorded in the smoke checkpoint.
- [ ] **Deferred until master integration:** Additional local/NAS speed comparisons, including the nine-still confirmation preset. Not a gate for this checkpoint or the second adapter decision.
- [ ] Owner selects a higher-FPS 3-second preset using **Clip quality: 10 / 20 / 24 / 30 FPS** on one or two representative motion files. Hold 320 px and 250 kbit/s fixed initially; judge motion/detail and transitions, not speed. Expand storage/performance qualification after integration.
- [ ] Owner accepts motion smoothness and transitions across the clip array in real Chrome/Edge gallery use. Native preview controls and media interaction are absent; existing card actions and the main player still work.
- [ ] Verify visibility/reduced-motion behavior, bounded extraction/playback, cancellation/reselection, unsupported-codec fallback, URL cleanup and any persistence/quota behavior with focused tests and native-browser smoke.
- [ ] Demonstrate that background clip generation does not materially regress first usable previews, filtering, scrolling or foreground playback. Record production safety, memory and format-qualification gaps explicitly before enabling it by default.

## BVR-004 — Focus loss leaves normal ingestion with incomplete screenshot arrays

**Status:** Targeted recovery implementation is on `feat/video-benchmark-view`; physical Windows focus-loss acceptance remains open. The normal app now pauses background preview attempts on blur/hidden and restarts them through its existing queue when visible and focused. Metadata/cover ingestion is unchanged. See the [smoke checkpoint](testing/ingestion-clip-ux-smoke.md). **Priority:** High reliability issue; prevent silent partial preview results before expanding background preview work.

**Reported symptom / requested behavior:** In the normal app, ingestion does not produce the full screenshot array after switching browser tabs or losing window focus. This is not a report about the benchmark runner. The owner requests explicit ingestion pausing while out of focus, followed by safe continuation that completes the missing screenshots. Treat page visibility and window focus as separate triggers during reproduction; do not assume that monitoring `document.hidden` alone covers both.

### Reproduction and investigation

- Start a representative multi-file import in the normal app. While screenshots are being generated, switch to another browser tab, return, and inspect each source's actual versus expected screenshot count. Repeat separately with window focus loss while the page remains visible. Record the affected stage, displayed completion/error status, counts before/after return and whether missing screenshots are ever recovered; compare local files and NAS as needed.
- The successful benchmark reports supplied with this bug all have `hidden: false`, no errors and completed rows; they do not reproduce or diagnose the normal-app failure. Capture the affected ingestion attempt and privacy-safe diagnostics before changing scheduling or timeout behavior. Investigate how partial screenshot arrays are returned, persisted and classified as complete.
- Keep benchmark validity separate from normal ingestion. The current extraction runner intentionally aborts when `document.hidden` becomes true (`src/benchmark/runExtractionBenchmark.ts`), and the plan UI asks users to keep the tab visible. Preserve that boundary; this ingestion fix must not turn paused/resumed benchmark work into a qualified uninterrupted timing sample.

**Code/test findings:** Readiness and backfill previously treated more than one frame as complete; same-ID cached reimports could skip repair without updating the retained UI object. Focus loss had no resumable preview policy. Regression tests exercise these paths and stale attempt ownership. The current DOM generator normally discards a failed set rather than returning newly generated partial frames, so the exact origin of the owner's persisted short arrays is not yet independently reproduced. The fix requires nine normal previews, preserves old usable frames until atomic replacement, and reuses the existing queue rather than introducing an ingestion rewrite.

### Acceptance

- [ ] Reproduce the failure and identify the affected state transition before implementing a fix. Cover both actual backgrounding and visible-but-unfocused behavior; make the supported pause policy explicit.
- [x] Implement an explicit **Previews paused** state with automatic continuation through the existing background queue; preserve completed work. Controlled native focus tests verify recovery without reload.
- [x] Require nine normal preview frames and preserve old usable frames until complete atomic replacement. Regression tests cover partial Blob/legacy sets and same-ID cached reimport.
- [x] Verify repeated resume, cancellation/removal and stale attempt ownership with targeted tests. Native controlled lifecycle tests pause beyond the initial seek timeout, resume with an aborted attempt and persist all nine frames.
- [ ] Owner verifies physical tab switching and visible-window focus loss on Windows Chrome/Edge, using representative local/NAS files. Controlled native lifecycle tests pass but do not reproduce the original OS/browser suspension mechanism.
