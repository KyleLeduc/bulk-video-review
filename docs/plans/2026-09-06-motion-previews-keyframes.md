# Motion Previews and Seek Keyframes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the normal gallery's static-image loop with default-on 1.5-second, 20 FPS motion clips, add small granular seek thumbnails and provide a self-contained quality-tuning runner.

**Architecture:** Reuse the existing background scheduler and foreground DOM metadata/cover lane. A second processing adapter produces independently validated motion and keyframe products, with versioned disposable caching and no authoritative database migration. Both normal-app extraction and the UX benchmark use shared extraction code.

**Tech Stack:** Vue 3, Pinia, TypeScript, IndexedDB, existing Mediabunny 1.55.7 workers/WebCodecs, Vitest and Cypress Chrome/Edge.

---

## Preconditions and execution discipline

- Read [the design](2026-09-06-motion-previews-keyframes-design.md), repo AGENTS.md and the current parser qualification caveats. Starting feature HEAD at planning: `165bd3d`.
- Use `/home/dev1/projects/bulk-video-review/.worktrees/feat-video-benchmark-view`; run the canonical bootstrap before npm/dev commands. Preserve the deliberate private node_modules install and unrelated primary/master edits.
- Root owns writes, one active heavy command, browser container lifecycle and task ledger. Reuse children only for independent read-heavy audits/reviews. No additional container, dependency, general worker pool or ingestion rewrite.
- Use @test-driven-development for each behavior: add a failing assertion, run it, implement minimally, rerun. Use @systematic-debugging for unexpected failures, @verification-before-completion before handoff and @requesting-code-review for the new boundaries.
- Keep design, policy/adapter, queue/cache and UI changes reviewable. Do not push, deploy, merge master or close out the worktree as an implicit implementation step.
- Native runtime qualification is a separate Task 7 gate; implementation alone does not establish it. Resolve a critical plan/code discrepancy before proceeding; bring genuinely new product choices to the owner.

## Implementation checkpoint — 2026-09-06

Owner approved continuation at 15:22 -06:00. Tasks 4–6 completed their implementation checkpoint at **16:05:09 -06:00**. Paused for owner feedback before Task 7 native qualification.

Tasks 1–6 are implemented and automatically verified on the feature worktree. Normal-app DI now enables motion/keyframe enrichment through the existing queue. Gallery hover cycles inert 1.5-second / 20 FPS clips, with cover-only fallback; the seek rail uses only the new keyframes. Complete products are independently retained before optional cache writes and subsequent cancellable work; metadata and votes stay outside the disposable cache.

- Fresh verification: `npm run lint` (no warnings), `npm run type-check`, `npm run test:unit` (**74 files / 656 tests passed**), `npm run build` and `git diff --check` passed. The production build emitted both promoted worker assets and the shared motion component.
- Independent read-only reviews of Tasks 4–6 found no remaining Critical or Important issues after reproduced regressions corrected wipe dispatch/deletion races, normal-app report identity and portrait tooltip bounds. Earlier Tasks 1–3 reviews remain recorded in the task ledger. Three full-suite filter failures were stale legacy-still fixtures; contract-aligned motion fixtures now pass.
- Focus recovery: blur or hidden stops dispatch and retires active extraction; visible **and** focused resumes only missing complete products. Completed clips survive a later keyframe interruption, including when clip caching failed. Active interrupted arrays never count as complete.
- Quality runner: fixed production motion plus 120 / 160 / 240 px keyframes, one predetermined sample source, no app cache, and media published only after all measured work ends. App and runner share a bounded, letterboxed 16:9 seek-image viewport. Manual config / Test runner separation is preserved.
- Not yet verified: real-browser new-workload timeline alignment, encoding, IndexedDB rollback and normal-app recovery. Native Chrome/Edge qualification and owner Windows focus/quality smoke remain Task 7 gates.
- Next batch: Task 7 native smoke and reviewed release readiness, then Task 8 follow-up records. This is the executing-plans integration review checkpoint, not native acceptance or release completion. Changes are uncommitted and not deployed; master is untouched.

### Owner-authorized smoke publication — 2026-09-06

After this checkpoint, the owner explicitly requested **commit and deploy**. This authorizes publication of Tasks 1–6 to the existing HTTPS preprod smoke environment before the remaining native/owner acceptance; it does not authorize master promotion or mark Tasks 7–8 complete.

Release procedure: rerun lint, types, the unit suite and production build; commit only this feature's changes; push `feat/video-benchmark-view`; require its successful immutable-image push CI; dispatch the reviewed platform `deploy.yml` with the exact app SHA; verify controller health, live revision and retained rollback target. Preserve the current browser origin and unrelated work. Record run IDs and deployment evidence in the ignored release ledger and user handoff, without introducing a second source commit solely to embed its own SHA.

## Task 1: Define the two products and exact sampling policy

**Files**

- Create: `src/domain/entities/VideoPreviewClip.ts`
- Modify: `src/domain/entities/ParsedVideo.ts`, `src/domain/entities/index.ts`
- Create: `src/domain/services/videoPreviewPolicy.ts`, `src/domain/services/videoPreviewPolicy.spec.ts`
- Modify: `src/application/services/previewCompleteness.ts`
- Modify: DTO factories in `src/test-utils/index.ts` and direct DTO constructors identified by TypeScript.

**Step 1 — Write failing policy/DTO tests.** Assert these concrete examples and invalid finite-duration cases:

```ts
expect(keyframeTargets(10)).toEqual([0])
expect(keyframeTargets(60)).toEqual([0, 15, 30, 45])
expect(keyframeTargets(1500)).toHaveLength(100)
expect(keyframeTargets(3000)).toEqual(
  Array.from({ length: 100 }, (_, i) => i * 30),
)
expect(keyframeTargets(15.1)).toEqual([0, 15])
```

Assert motion/keyframe completeness independently rejects short arrays and wrong recipe versions; nine legacy frames do not mark the new motion product ready.

**Step 2 — Run red.** `npx vitest run src/domain/services/videoPreviewPolicy.spec.ts --exclude '.worktrees/**'`. Confirm failures represent missing policy/fields, not a malformed fixture.

**Step 3 — Implement the minimal domain model and pure policy.**

```ts
export interface VideoPreviewClip {
  timestampSeconds: number
  durationSeconds: number
  blob: Blob
  width: number
  height: number
}
// ParsedVideo adds separate motionClips and keyframes arrays.
// It also adds previewVersions: { motionClips?: string; keyframes?: string }.
// Attach a version only when the corresponding complete product is validated.
// Keep legacy previewFrames/thumbUrls readable; do not generate their slideshow.
```

Use `min(100, ceil(duration / 15))` targets with interval `max(15, duration / 100)`, excluding the end. Domain/DTO timestamps are in the original main player's playback-time coordinate; raw packet times stay inside infrastructure. Keep the tested duration-appropriate maximum-ten clip sampling policy. Version the chosen clip and keyframe recipes. Put validation policy below application/infrastructure rather than importing framework/worker code into domain.

**Step 4 — Run green and types.** Repeat the policy spec; `npm run type-check` identifies all construction sites. Update only those required DTO initializers/factories. Preserve old nine-still helpers only for the explicitly legacy benchmark/use case.

## Task 2: Share worker extraction with the production adapter

**Files**

- Promote reusable implementation from `src/infrastructure/video/benchmark/` to `src/infrastructure/video/extraction/`: clip/preview policies, workers, worker clients and file reader with their specs. Update imports mechanically; retain DOM benchmark-specific setup in its existing layer where possible.
- Create: `src/application/ports/IVideoPreviewGenerator.ts`
- Create: `src/infrastructure/adapters/MediabunnyVideoPreviewGenerator.ts` and `.spec.ts`
- Modify: `src/application/ports/IVideoSessionRegistry.ts`, `src/infrastructure/video/services/VideoSessionRegistry.ts` and session-registry test doubles.
- Modify: shared worker protocol/specs only where required to support the new keyframe workload.

**Step 1 — Establish a targeted green baseline before moving shared code.** Run the existing clip, reader and preview worker specs. Preserve evidence and behavior of legacy 9/100 workloads.

**Step 2 — Write red adapter/protocol tests.** Assert production explicitly supplies 1.5 s / 20 FPS; keyframes accept 1–100 targets using the exact domain policy, correct aspect ratio and 160 px width. Cover zero-start/nonzero track offsets, invalid dimensions/counts, short replies, unsupported codec, abort/deadline termination and malformed worker replies. The File accessor returns the registered File or null, and unregister removes access.

**Step 3 — Run red.** `npx vitest run src/infrastructure/adapters/MediabunnyVideoPreviewGenerator.spec.ts src/infrastructure/video/extraction --exclude '.worktrees/**'`.

**Step 4 — Implement minimally.** Use distinct generator operations for clips and keyframes, with the existing AbortSignal/progress/timing hooks where applicable. Promote code rather than duplicating the already qualified clip converter. Introduce an explicitly discriminated keyframe workload/protocol; do not silently reinterpret legacy benchmark previewCount 9/100.

Keep input/coded dimensions, output counts/types/bytes, reader limits, codec capability checks and disposable-worker timeout validation. Establish the player-time/demuxer-time translation with nonzero-start/edit-offset fixtures; do not assume first track timestamp equals HTML media origin or leak raw clip-worker starts into the DTO. Fail the affected product explicitly if mapping cannot be supported reliably. Read/output budgets are not hard parser-memory limits. Do not import benchmark orchestration or reports into the app adapter. No new library dependency or broad input-format support.

**Step 5 — Run green and build.** Repeat the targeted specs, `npm run type-check`, then `npm run build` sequentially to prove promoted worker URLs/assets bundle.

## Task 3: Add versioned disposable cache and independent-product use case

**Files**

- Create: `src/domain/repositories/IVideoPreviewCacheRepository.ts`
- Create: `src/infrastructure/repository/VideoPreviewCacheRepository.ts` and `.spec.ts`
- Create: `src/application/usecases/UpdateVideoPreviewsUseCase.ts` and `.spec.ts`
- Modify: `src/application/usecases/WipeVideoDataUseCase.ts` and `.spec.ts`
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.ts` and `LinearVideoIngestionUseCase.previewFrames.spec.ts`
- Modify: relevant export barrels.

**Step 1 — Write failing cache tests.** Complete clip/keyframe products persist independently; replacing keyframes cannot erase clips. Read validates recipe/count/Blob kind. Test transaction abort after request success, cache version misses, 256 MiB cache-only eviction, quota/unavailable storage, clear and pending-write/wipe ownership. A production cache connection is not acquired by legacy benchmark composition.

**Step 2 — Run red.** `npx vitest run src/infrastructure/repository/VideoPreviewCacheRepository.spec.ts --exclude '.worktrees/**'`.

**Step 3 — Implement the cache.** Separate database `BVRPreviewCache-v1`, with explicit kind/version/video identity keys. Do not upgrade `VideoMetaDataDB`, overwrite old still records or evict metadata/votes. Await transaction completion. Bound generated encoded data; count bytes without reading all Blobs into ArrayBuffers. Cache failure is observable and nonfatal to review/foreground ingestion.

**Step 4 — Write red use-case/hydration tests.** Generate motion then keyframes; persist each complete product separately. Simulate keyframes throwing after clips commit: clips remain usable and a retry does not regenerate them. Reverse failure: keyframes still generated. Add the combined case **motion succeeds → cache write fails → keyframes abort → resume generates only keyframes**. On abort, stop the current worker, keep completed products and publish no stale completion. Cached imports register original File and hydrate current products without changing votes/title/tags; missing File performs no extraction.

**Step 5 — Run red, then implement minimally.** `npx vitest run src/application/usecases/UpdateVideoPreviewsUseCase.spec.ts src/application/usecases/LinearVideoIngestionUseCase.previewFrames.spec.ts src/application/usecases/WipeVideoDataUseCase.spec.ts --exclude '.worktrees/**'`.

Use the existing aggregate/source ownership guards. Deliver each complete product plus its version through an ownership-checked per-product callback before starting the next product; do not wait for the final whole-job return to retain successful in-session work. The receiving store verifies controller/ID ownership and signal state, then merges only that product. Return product-specific errors; never treat fallback as a successful clip. Quota failure retains successful in-session data, with diagnostics; later hydration does not replace it with a stale cache entry. Explicit wipe invalidates active enrichment before clearing its cache; delayed writes must not repopulate wiped data. Do not mutate aggregate review metadata merely to save derived previews.

**Step 6 — Run green.** Repeat both cache and use-case groups. Request a read-only architecture review of source, cache and cancellation boundaries before queue wiring.

## Task 4: Wire the existing queue and update readiness coherently

**Files**

- Modify: `src/infrastructure/di/createVideoServices.ts`, `createVideoServices.spec.ts`, `container.ts`
- Modify: `src/presentation/stores/videosStore.ts`, `videosStore.previewScheduler.spec.ts`, `videosStore.ingestionScheduler.spec.ts`
- Modify: `src/domain/services/VideoFilterService.ts` and `VideoFilterService.spec.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`, `DiagnosticsPanel.spec.ts` and preview progress types as needed.
- Modify: `src/benchmark/run.ts` (isolated service-construction caller), `runVideoBenchmarkSuite.spec.ts`, `VideoBenchmarkTrial.vue` and its spec only as needed for explicit legacy mode.

**Step 1 — Write failing scheduler cases.** An old nine-still record queues motion/keyframe upgrade. One product succeeds and the other fails: merge success and show the failed product without changing votes/pins/URL. Focus loss during keyframes resumes only keyframes. Repeated focus events, remove/reselect with late old completion, foreground import priority, failed cache and wipe must retain correct job ownership.

**Step 2 — Run red.** `npx vitest run src/presentation/stores/videosStore.previewScheduler.spec.ts src/infrastructure/di/createVideoServices.spec.ts --exclude '.worktrees/**'`.

**Step 3 — Wire minimally.** Keep one queue entry per video, existing automatic concurrency one and the same pause/resume scheduler. Replace every nine-frame assumption at enqueue, pump, result merge, cached reimport and diagnostics. Distinguish usable motion, complete keyframes, pending/retryable products and unsupported/failed outputs. Do not blindly mark fallback ready, discard successful fields or retry unsupported products indefinitely.

Use the new use case in normal DI by default. Preserve a clearly explicit legacy-still DI choice for old versioned full-pipeline benchmarks; they must never open the normal preview cache. Avoid a user-facing opt-in setting.

**Step 4 — Write/run filter tests.** Motion-ready means actual playable clips; keyframes and legacy stills alone do not qualify. Change the existing predicate and concise label if needed.

**Step 5 — Run green.** Scheduler, ingestion, filter, diagnostics and DI tests, then types. Review the queue diff for unnecessary reshaping of sessions/maps/ownership.

## Task 5: Replace hover slideshow and separate seek-rail data

**Files**

- Modify: `src/presentation/components/VideoCard.vue`, `VideoCard.spec.ts`, `VideoCard.previewFrames.spec.ts`
- Modify: `src/presentation/components/VideoEmbed.vue`, `VideoEmbed.previewRail.spec.ts` only where needed for keyframe semantics/native-size rendering.
- Create a focused motion-display component only if it genuinely owns reusable lifecycle logic shared with the benchmark; avoid a pass-through wrapper.

**Step 1 — Write red component tests.** Cover remains before playback, on no clips, reduced motion and rejected play. Clip ended cycles the array and wraps a single clip. Native controls/interactivity are absent. Leaving viewport, filtering, blur/hidden, source replacement and opening main player stop motion; late callbacks never restart it. All URLs revoked on replacement/unmount.

Assert the seek rail uses only `keyframes` and correct nearest timestamps; preserve the existing compact tooltip viewport while rendering smaller encoded images. Empty keyframes keep time tooltip/seeking. Card actions/player controls still function.

**Step 2 — Run red.** `npx vitest run src/presentation/components/VideoCard src/presentation/components/VideoEmbed.previewRail.spec.ts --exclude '.worktrees/**'`.

**Step 3 — Implement minimally.** Remove the 500 ms image-rotation timer. Reuse the current card hover/warmup interaction, adding proper media lifecycle ownership, visibility guards and object-URL cleanup. Keep native media inert, muted and inline. Render the cover under loading/failure states. Do not repurpose clip positions as seek thumbnail timestamps.

**Step 4 — Run green.** Repeat component tests and existing gallery tests; inspect actual built-browser layout later, not just happy-dom assertions.

## Task 6: Add the keyframe quality runner

**Files**

- Modify: `src/benchmark/extractionPlans.ts`, `runExtractionBenchmark.ts`, `runExtractionPlan.spec.ts`
- Create: `src/benchmark/runKeyframeBenchmark.ts` and `.spec.ts`
- Modify: `src/benchmark/ExtractionPlanPanel.vue`, `ExtractionPlanPanel.spec.ts`
- Modify: `src/benchmark/CustomExtractionBenchmark.spec.ts` only if tab/selection behavior changes.

**Step 1 — Write red preset/report tests.** New `motion-keyframes-quality-v1` has a fixed 1.5 s / 20 FPS clip step, then keyframes 120/160/240 px, all one job with identical production sampling. Manual settings cannot alter it. Report expected/actual per-file counts including short and long sources, recipe and privacy-safe failure details.

**Step 2 — Run red.** `npx vitest run src/benchmark/runExtractionPlan.spec.ts src/benchmark/runKeyframeBenchmark.spec.ts src/benchmark/ExtractionPlanPanel.spec.ts --exclude '.worktrees/**'`.

**Step 3 — Implement report/preset flow.** Reuse the exact production extractor/policy, but no production cache. Keep one existing benchmark lock across all steps; retain all results on failure/interruption. Do not loosen old still protocol/count contracts to smuggle in keyframes. Use a new report mode for the new workload. Add a step-aware keyframe sample callback (the current runner retains only its final still step), and derive mixed-plan labels from actual step workloads rather than the current `clips-` prefix.

**Step 4 — Implement the sample display from failing UI tests.** Fix source identity before running, retain one bounded sample set per width and mark a failed width on that same source. Show actual mouseover seek comparison at one fixed production tooltip viewport and a single clip player. Label encoded dimensions/bytes without changing rendered size per width. Do not publish/render media until all measured work ends, and publish none after interruption. Reset and failed URL creation clear partial/all URLs/results and preserve the two-tab ownership rules.

**Step 5 — Run green and privacy assertions.** Report JSON excludes file names/paths, Blobs, data/object URLs and source targets. Interrupted plans retain partial evidence and cannot auto-resume as valid timing runs.

## Task 7: Native smoke and reviewed release readiness

**Files**

- Create: `cypress/e2e/motionPreviews.cy.ts`
- Modify: `cypress/e2e/previewFocusRecovery.cy.ts`, `cypress/e2e/extractionPlan.cy.ts`
- Modify: `docs/testing/ingestion-clip-ux-smoke.md`, `docs/testing/custom-mediabunny-benchmark.md`, `docs/backlog.md`

**Step 1 — Add native assertions before acceptance.** Public-fixture real encoding, expected clip counts/duration/FPS, granular keyframe count/size, hover array cycling, seek nearest-frame matching, default-on app DI, legacy cache upgrade/reselection, quota fallback, cancellation/removal/wipe, filtered/offscreen playback and blur/hidden recovery. Do not substitute a worker mock for native decode/encode qualification.

**Step 2 — Run one heavyweight check at a time.** `npm run lint`; `npm run type-check`; targeted test groups; `npm run test:unit`; `npm run build`. Check Cypress types using the repository's existing command. Review exact results rather than prior-run counts.

**Step 3 — Root runs Chrome then Edge smoke in the existing shared browser environment.** Verify container ownership/mounts and current app port first; build output must be the feature checkout. Do not provision a new environment per agent. Include legacy custom/pipeline benchmark isolation regression where affected.

**Step 4 — Independent review and fixes.** @requesting-code-review with focus on partial-product publication, stale result/cache writes, dependency direction, benchmark isolation and media URL lifetimes. Reproduce findings with tests; use @receiving-code-review before acting on feedback.

**Step 5 — Update evidence and hand off.** Mark implemented/automated/native/owner acceptance separately. Owner Windows physical focus-loss and representative quality smoke remain explicit until performed. Keep parser/native allocation caveats and unsupported-codec fallback honest.

## Task 8: Follow-up records, not optimization work in this slice

Update BVR-002 with post-master exploration from the current measurements:

- Compare local/NAS storage under matched source identity, order, build, sampling and concurrency; direct vs buffered application reads are not wire traffic.
- Investigate sequential clip decode versus dispersed still/keyframe seeks, reader latency/prefetch and first useful product delivery.
- Map and simplify existing ingestion/backfill state only after correctness coverage; no queue rewrite bundled into this feature.
- Measure foreground responsiveness, per-file tail latency, retained DTO/Blob bytes, cache eviction and native decoder/GPU memory. Do not infer a single-thread bottleneck from wall time.
- Keep richer date/failure metadata and FFmpeg WASM separately scoped.

No new speed claims, master merge, push, deployment or cleanup are part of executing these local implementation tasks.
