# Video benchmark view design

**Status:** Direction approved by the user on 2026-09-05; implementation not started. The approved increment is a separate dev/preprod benchmark page using the fixed reference fixtures. WebCodecs and a demuxing dependency are subsequent experiments, not part of this increment.

**Code baseline:** `feat/video-processing-measurements` at `f7c839b05db686e8e5b1902c51e00adefd3ad0e5`. Preserve the original [reference results](../testing/video-processing-performance.md#public-reference-results--2026-09-04-local--2026-09-05-utc); a new measurement surface needs its own baseline.

## Decision and expected benefit

Build a small benchmark page and retain automated execution. Both exercise the real ingestion/preview implementation and share fixture definitions, case ordering and result validation. This lets the user repeat controlled trials in native Chrome/Edge without operating the main gallery or returning private videos. It also gives a future extraction backend an A/B comparison before activation in the product.

Alternatives considered:

1. CLI only: smallest change, already provides a reproducible reference matrix, but inconvenient for native browser comparisons on the user's machine.
2. Separate page plus existing CLI: selected; accessible controls and automated evidence with the same processing implementation.
3. Standalone laboratory app or an expanded main diagnostics panel: rejected for this increment; the former risks copied processing code, while the latter entangles repeated resets and measurement work with the real catalog and gallery.

The measured expensive stage is waiting for DOM seeks, not necessarily CPU execution on the main thread. The next sequence is benchmark page, a bounded seek/frame-extraction experiment, then production integration of an optimization only if measured. A large encoding-worker framework is not a prerequisite to that experiment. Existing cancellation/resource requirements still apply before enabling a worker backend in the product.

## First-version experience

- Direct `/benchmark/` entry, initially for local development and explicitly enabled preprod. No navigation or benchmark initialization in the normal review view.
- Select the local fixed reference folder once. Show its manifest identity, expected selection count and validation status. Media remains local and outside Git, the image and server uploads.
- Choose one or more existing foreground 1/2/4 and preview 1/2 configurations, repetitions (default 5; maximum 5 for this first view), and fresh-processing or fresh-plus-cached pairs. The only real backend initially is `dom`; show WebCodecs as not implemented, not a selectable dummy backend.
- One active trial, with the current configuration, repetition, phase and completed-trial count. Rotate configurations between repetitions; once a second backend exists, alternate backend order while keeping each fresh/cached pair adjacent.
- `Stop after current trial` prevents further admission. Foreground extraction has no cancellation signal today: do not label this immediate cancellation, reset state beneath it or add broad product cancellation changes solely for this page.
- After trials, show median and range, counts, phase totals, failures and output checks. Display the most recent output thumbnails only after timing ends and release them before the next trial. Provide an explicit JSON download; no automatic result upload or permanent results database.
- Retain failed, interrupted and invalid rows. Incomplete suites must not display a success badge or a speedup comparison based on a conveniently surviving subset.

## Reuse and isolation

### Separate entrypoints, shared implementation

Use Vite's existing multi-page capability rather than adding a router. Add `benchmark/index.html` for the controls and `benchmark/run.html` for a small trial host. The host is a fresh, visible same-origin iframe for each trial, with its own Vue/Pinia instance and injected dependencies; it does not mount `App.vue`, the gallery or diagnostics. The parent holds selected Files and small result records, not the processing store.

Reuse `useVideoStore`, the existing use cases, parser, thumbnail generator and repositories. Extract only the existing composition into `createVideoServices` under infrastructure DI, with an explicitly supplied database connection. Production `container.ts` continues to expose its current singleton services using the unchanged default database. This factory has two concrete consumers and avoids a second scheduler or parallel dependency graph. The benchmark must never import the production container to obtain services.

The fresh host prevents timers, stores and session Files from a completed trial carrying into the next trial. It is a lifecycle boundary, **not a security sandbox or a new browser process**. Its visibility and cache semantics must be recorded; do not claim comparability to the old full-gallery/fresh-profile run merely because both use Chrome.

### Database ownership

Add a constrained benchmark connection factory to `DatabaseConnection`, retaining `getInstance()` and `VideoMetaDataDB` exactly for normal use. The factory derives `BVRBenchmark-v1-<pair UUID>` internally; it cannot accept an arbitrary database name. Fresh processing gets a newly generated pair ID and empty v4 database. Its cached partner uses that same database in a new host/registry, reselecting the original Files so restoration is genuinely persistent rather than an in-memory cache hit.

Explicit connection closing must handle already-open and pending opens without reconnecting a disposed instance. After a terminal trial, release registered Files/object URLs, dispose the store/app, close the connection and remove the host. After the cached partner (or a stop/failure), delete only this session's exact recorded benchmark database. Never enumerate all browser databases or call the production wipe action. A blocked deletion is a reported cleanup failure, not permission to clear a broader database or start another trial.

An unexpected page/process exit can leave an isolated benchmark database. Report the possibility; do not silently sweep historical databases on startup. A future recovery UI is separate work. Votes/thumbnails in the real catalog must be verified unchanged in real-browser sentinel tests.

### Sequential execution and failure boundaries

Hold one named Web Lock for the benchmark suite to prevent two benchmark tabs from running concurrently on this origin. Require the capability for this Chrome/Edge-first page; report unavailable rather than pretending cross-tab exclusion exists. The lock does not stop normal app tabs, other origins or other programs: instructions must ask the operator to close competing work and record that hardware load is uncontrolled.

Use a versioned, narrow parent/host message contract with exact origin, source-window, suite/pair/trial IDs and one terminal result. Pass only selected Files and validated configuration into the host; return redacted measurements and bounded output metadata. Reject stale/duplicate/foreign messages. Do not expose a general command executor, arbitrary imports, URLs or database names through messages/query parameters.

Wait for foreground completion **and** all preview jobs/attempts to settle; `addVideosFromFiles()` resolves before background previews finish. Read the full report only then. Do not repeatedly stringify diagnostics during timed work. Use existing reactive terminal signals and a small phase/progress display.

On Stop, finish the current trial, clean up, mark the suite interrupted and skip its remaining cases (including an unstarted cached partner). Startup/trial/cleanup deadlines must be explicit and included in the protocol. A timeout stops the suite and retains evidence; removing a frame is not proof that accepted IndexedDB transactions were undone. Await exact database deletion or report the orphan and require a fresh page before another suite; never start overlapping fallback work after uncertain cleanup.

## Fixture identity and fair measurements

Track the small public manifest and attribution, not the 654 MB selection. Reuse `bbb-sunflower-reference-v1`: 10 selections, 7 supported unique videos, 2 deliberately invalid files, 1 duplicate, 63 generated preview frames per successful fresh run. Preserve the source/derivative hashes and expected invalid outcomes; do not replace difficult fixtures to make a backend pass.

Browser selection validates paths where available, names, sizes, multiplicities and canonical order against the fixed manifest. Flat selection may match the known identical duplicate entries but must reject other ambiguous mappings. Retain the same File objects across the suite. File selection, validation and any fixture preparation are outside the timed interval.

Do not read the 633 MB source into a full ArrayBuffer just to hash it in the browser. A UI-only export must state `fixtureVerification: selection-only`, with the manifest's **expected** full hashes distinguished from verified content hashes. The existing Node runner verifies actual contents with streaming SHA-256 and can attach `sha256-verified` provenance to its own exported evidence. It must not trust a browser-supplied claim of full verification. Full content verification in the browser is deferred unless a bounded, justified implementation becomes necessary; fixture identity assurance is never fabricated.

Report separately:

- `pipeline-no-gallery-v1`: real store scheduling, metadata/cover extraction, previews and persistence, without gallery rendering. Time from admission until the full pipeline settles; report host startup and teardown outside that interval.
- Existing full-gallery automated/native checks: user interaction, playback, first-visible rendering and persistence acceptance. These remain required for an optimization release.

Label caches precisely: fresh benchmark database per pair; fresh host per trial; shared browser process and OS caches not flushed. Cached trials prove persistence reuse, not faster frame decoding. Never combine them with fresh trials or with the old runner's fresh-browser-profile timings.

Each export carries protocol version, app build identity, backend, fixture manifest/verification, browser information, configuration/order, repetitions, cache scope, visibility, terminal counts, output validation, durations and cleanup status. Show missing process/decoder memory and input-to-paint measurements as unavailable, not zero. Page-only tests do not claim native decoder memory measurement.

Validate frame count, timestamps/order, dimensions, nonempty decodable JPEG output and expected invalid/duplicate outcomes. Provide post-trial thumbnail inspection; byte-identical JPEG output is not required across future encoders. Wrong, missing or fallback outputs cannot be reported as a successful optimized-backend comparison. The future backend decision must define its eligible corpus and fallback accounting before measurements.

## Dev/preprod availability

Build the entries into the same immutable image, but gate benchmark documents and the capability endpoint at the server with `BVR_BENCHMARK_ENABLED=true`, default false. Reserve `/benchmark` and `/benchmark/…` before SPA fallback so disabled/unknown benchmark paths cannot become the normal app. Enabled documents and capability responses are no-store/no-cache as appropriate; preserve existing health, static-asset and method/path protections. Client initialization checks capability before any test state or processing is created.

The Vite development server supplies the equivalent capability response for local development; built `vite preview` without that response is not proof of production enablement. Browser acceptance of this view must use the production server with the flag explicitly enabled. Keep normal browser targets and dependencies unchanged; the installed Vite 7 uses `build.rollupOptions.input`.

Pass the narrowly scoped flag through production Compose with false as its default. Update the existing contract test that currently forbids all environment entries to allow only this documented entry, not arbitrary environment mutation. Before a requested preprod rollout, verify the homelab controller's supported environment mechanism and obtain any required bounded platform configuration approval. Do not hard-code the preprod hostname, change CI trust, rebuild a different image for each environment, or infer live configuration/deployment authority from this design approval.

The flag controls feature availability, not authorization to protected data. Public JS chunks contain no secrets; a server flag is not a security sandbox for arbitrary same-origin JavaScript. The actual data protection is explicit benchmark dependency/storage ownership and absence of upload/server-processing APIs.

## Scope and acceptance

No WebCodecs, demuxer, worker pool, full-file hashing, dependency/toolchain upgrade, playback/filter policy change, database migration, production origin migration, fixture download on page load or live deployment is included in this design-recording task.

Implementation acceptance requires unit lifecycle/protocol/storage tests, real Chrome/Edge page tests against the production server, unchanged normal-app smoke, reproducible DOM-only trials, and a user native-page check. The benchmark feature claims better measurement ergonomics, not increased ingestion throughput. Keep original raw baseline artifacts intact.

After implementation, checks and architecture review, the next acceptance step is the feature branch on existing preprod when deployment is authorized, before squash/fast-forward/merge. The earlier primary-checkout `AGENTS.md` acceptance instructions remain separate uncommitted work and must not be accidentally bundled with this feature.

Primary references: [Vite 7 multi-page builds](https://github.com/vitejs/vite/blob/v7.3.6/docs/guide/build.md#multi-page-app), [Web Locks lifecycle and scope](https://www.w3.org/TR/web-locks/). See the [implementation plan](2026-09-05-video-benchmark-view.md) for exact work slices.
