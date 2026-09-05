# Video processing measurements

## Isolated benchmark page — 2026-09-05

`feat/video-benchmark-view` adds `/benchmark/` and fresh per-trial iframe hosts, reusing the existing DOM parser, store, use cases and repositories. No decoder, worker, new dependency or scheduling default is introduced. The historical full-gallery record below remains frozen; the new `pipeline-no-gallery-v1` / protocol v2 results are a separate baseline, **not a speedup claim**.

### Native preprod smoke

1. Open `https://bvr.preprod.home.arpa/benchmark/` in current Chrome or Edge after the release is enabled. Keep the tab visible, close competing heavy work, and retain the same browser/machine/power conditions.
2. Select the prepared `bbb-sunflower-reference-v1` folder (the same public reference corpus used below). Expected selection: 10 media entries, 7 supported videos, 2 invalid entries and 1 duplicate. Metadata/archive files are ignored; missing/extra media or wrong sizes fail preflight. The page checks names, sizes, paths and multiplicity, **not content hashes**. It never uploads videos.
3. Leave DOM ingestion **2**, previews **1**, repetitions **5**, and cached trials enabled. Start; expect ten serial trial rows, each with 7 videos / 63 persisted, decodable JPEG previews. Inspect phase totals and latest thumbnails, including portrait/rotation and timestamp selection. A fresh trial means fresh database and host, not a cold browser/OS cache.
4. Download JSON. Failed, hidden-tab, incomplete, mixed-identity or unresolved-cleanup results are retained but excluded from comparable summaries. Memory/native decoder and interaction latency are unavailable in the page; overlapping phase totals are not percentages of wall time.
5. Return to the normal review page and confirm existing votes/thumbnails remain. **Do not wipe the catalog.** Benchmark databases use exact generated `BVRBenchmark-v1-<UUID>` names; only the owned pair is deleted after host closure. Stop waits for the current trial. Uncertain cleanup halts admission and requires reload; unresolved pair IDs are reported, never swept.

The prepared corpus is retained on the devbox under the ignored `20260904-184155-dependencies-and-performance/reference-corpus` task-evidence folder. Copy that public fixture folder to the browser machine when needed; no operator media is required. Attribution and fixture hashes are visible in the page and tracked in `src/shared/benchmark/referenceFixtures.json`; media is not bundled in the app.

### Built local runtime and opt-in automation

```sh
npm run build
BVR_BENCHMARK_ENABLED=true HOST=127.0.0.1 PORT=4173 node scripts/productionServer.mjs
# Separate terminal, inside the prepared Linux browser environment:
node scripts/videoProcessingBenchmark.mjs --view pipeline --browser chrome \
  --corpus /corpus --output /evidence/chrome-pipeline.json \
  --url http://127.0.0.1:4173 --repetitions 5 --revision <full-built-source-sha>
```

Run Edge separately with a new output path; use `--pilot` for a separate one-pair rehearsal. The CLI explicitly sets and validates DOM 2/1 fresh/cached pairs, delegates ordering to the page, verifies actual fixture sizes and streaming SHA-256 before browser launch, and checks served assets against local `dist`. It captures pre-launch runner/resource identity, browser product and page UA, with whole-browser sampled summed RSS recorded separately. Summed RSS may double-count shared pages and is not native decoder memory. A failed/interrupted runner retains provenance and the last observed completed-row snapshot; uncatchable process failure can still require task-container cleanup. Output creation is exclusive and never overwrites earlier evidence.

`npm run test:benchmark -- --browser chrome` (then Edge) is explicitly opt-in and requires the enabled built runtime plus the prepared corpus mounted at `/corpus`. Ordinary `npm run test:e2e` excludes this reference-only spec and retains the normal gallery smoke. Cypress's frame rewriting is disabled to preserve the actual benchmark parent/source checks; [Cypress documents this option for valid code affected by rewriting](https://docs.cypress.io/app/references/configuration). The tests use disposable profiles, prove exact benchmark IndexedDB names, and retain a sentinel in the normal catalog.

Without exact runtime `BVR_BENCHMARK_ENABLED=true`, reserved benchmark routes return 404 before SPA fallback. The capability response and HTML are no-store. The same immutable image serves enabled preprod and disabled deployments; homelab's fixed BVR Compose template owns live enablement. Local Vite development is also usable when enabled, but its summaries are explicitly unqualified and cannot pass the strict built-artifact CLI gate. A source SHA alone does not establish CI provenance.

Local qualification, exact CI/publication and live deployment are recorded separately at the final checkpoint. Native appearance, pointer/keyboard feel and representative personal workload acceptance remain user checks.

## Historical full-gallery measurement record

Status: measurement-only implementation on `feat/video-processing-measurements`, based on security-refresh `922eac2`. The fixed public-reference matrix is complete: **120 validated Chrome/Edge runs** on app `00b7646`. Awaited DOM seeking dominates; no worker implementation, demonstrated worker speedup, merge or preprod deployment. Personal-workload and native human acceptance remain separate open gates. Runner publication/CI is a separate checkpoint from the measured app revision.

## What the report measures

Diagnostics → Run report retains schema version 1 and adds `measurements.version: 1`:

| Phase | Actual boundary |
|---|---|
| metadata | Awaited DOM video metadata load, for cover extraction or preview generation |
| seek | Awaited seek, including retries/timeouts within that seek |
| capture | Synchronous canvas allocation, dimensions, draw and resize |
| encode | Awaited JPEG `toBlob` completion, failure, timeout or abort |
| serialize | Cover Blob → persisted data URL; preview frames stay Blobs |
| persistence | Awaited aggregate/preview repository and failure-tracker operations; not event publishing |

Each foreground/preview phase contains `count`, `completed`, `failed`, `aborted`, `totalMs` and `maxMs`. Durations use `performance.now()`. These are **summed operation elapsed times**, not CPU time or exclusive pipeline wall time: concurrent operations overlap and waits include native browser work. Do not sum phase totals to calculate throughput. An absent phase means no samples, not free work. Queue wait and the existing foreground/preview/pipeline wall-time fields remain separate.

Preview attempts are distinct from ready videos. Interrupted attempts count as aborted; requeued work adds another attempt. A storage transaction's AbortError is an aborted persistence sample but a failed preview attempt unless the job's cancellation signal was actually aborted. A shared resumed job is credited to each owning session; do not sum sessions as a global physical-work counter. Removal/clear leaves a report nonterminal until its outstanding attempts settle. Later manual retries cannot change a completed run report.

Backend is `dom`, workers disabled, fallback reason null: there is no worker backend to fall back from yet. Foreground cancellation is explicitly unsupported; the future cancellation/drain work is not implemented by these diagnostics. No database version, ID hashing, source ownership or media output changes.

Aggregates have at most six phase entries per lane, not an unbounded event stream. Exported reports exclude filenames, video IDs, URLs and file contents. Reports still contain environment information, input byte/count summaries and timestamps; review before sharing. Timing callback failures are logged and cannot replace media/persistence results or errors.

## Repeatable native Chrome/Edge protocol

1. Use the same built revision, machine, power mode, viewport, foreground tab, browser versions and resource limits for every comparison. Record browser/OS, hardware, app revision and whether DevTools/probe are enabled. Do not benchmark a development/HMR server or run tests/builds concurrently.
2. Obtain an explicitly permitted, locally held fixed corpus covering short/long videos, high resolution, portrait/rotation, variable frame rate, duplicates, malformed inputs and supported/unsupported codecs. Keep a private manifest with order, formats, dimensions, duration and byte totals. Do not put operator videos, private paths or names in this public repository.
3. Launch a **separate disposable browser profile** against the built app, not the user's current catalog/profile. Never use Diagnostics → Wipe Database on the operator profile. Use one browser at a time. A fresh profile provides a cold catalog, not a cold OS disk cache; record disk/browser cache conditions honestly.
4. Set Diagnostics foreground concurrency to 1, 2 or 4 and previews to 1 or 2 **before** selection. Close Diagnostics during measured work. Keep filters cleared, the gallery initially empty and the top of the gallery visible.
5. Paste the entire trusted local `scripts/videoProcessingProbe.js` into that profile's DevTools console, then call `bvrVideoProbe.arm()`. This opt-in script is not bundled into the application. It starts on the next file-input change, before the application handler, excluding time spent choosing files. Select the corpus in its fixed order.
6. Once foreground and previews are fully settled, call `bvrVideoProbe.stop()` and save its returned JSON privately. Open Diagnostics and copy the final run report. Pair both outputs with configuration/run number and private corpus identifier. Stop the probe even if the run fails. `stop()` removes listeners, cancels animation frames and disconnects the observer; stopping twice returns null. Reload removes the installed probe entirely.
7. For a warm-catalog pair, reload without resetting that **disposable** profile's catalog, reinstall/arm the probe and reselect the identical corpus. The gallery starts empty after reload, but cached metadata/previews should be restored without new decode/encode jobs. Warm runs are a separate workload, not evidence of faster decoding.
8. Run five measured cold/warm pairs for each foreground × preview setting in both Chrome and Edge: 2 browsers × 3 foreground settings × 2 preview settings × 5 pairs. Rotate the six configurations by repetition, keeping cold/warm adjacent (`rotating-configurations-v1`), to reduce configuration-order bias. Chrome and Edge remain sequential groups, so do not infer causal browser speed differences. Keep warmups separate. Retain all runs and explain exclusions before computing medians; no cherry-picking. Recreate only the disposable profile between cold pairs, preserving the operator profile.

## Fixed public-reference runner

`scripts/videoProcessingBenchmark.mjs` is an opt-in **Linux container** benchmark utility using Node built-ins and the browser's native file-input protocol. It is not imported into the app and adds no dependency. It does not copy the large source file through Cypress buffers or upload videos. The container is disconnected from external networking after preparation; app and browser protocol listeners use container loopback only.

```sh
node scripts/videoProcessingBenchmark.mjs \
  --browser chrome --corpus /corpus --output /results/chrome.jsonl \
  --repetitions 5 --url http://127.0.0.1:4173 \
  --revision 00b7646da247c280c55e97f50d6d972b3116ddd4
```

Run Edge separately with `--browser edge` and a new output file. `--pilot` selects one cold/warm pair and labels it ineligible for the measured matrix. Output creation is exclusive: existing files/symlinks are refused. Media paths are realpath-checked inside the supplied corpus root and SHA-256 checked against `manifest.json`. The manifest includes ordered `{path, bytes, sha256}` entries and expected selected/accepted/supported/invalid/duplicate counts. Use a task-owned corpus/results directory, never an operator catalog or browser profile.

The runner verifies every served build asset against local `dist`, records corpus/build/runner/probe hashes, browser product/version, declared revision, viewport and resource identity. Each cold run creates a new profile; only its paired warm run reuses the catalog. SIGINT/SIGTERM closes the owned browser/profile and retains an interrupted record; uncatchable SIGKILL still requires root-owned container cleanup. No Docker volume is used or deleted.

Rows validate manual requested/effective concurrency, terminal job counts, fixed corpus bytes/classification, phase sample counts/outcomes and persistence boundaries. The two invalid files are retried on warm import: their failed metadata observations are expected; valid cached videos must perform no new seek/capture/encode/preview work. A malformed fetched report remains attached to a failed row. A processing failure stops collection and retains its evidence; do not silently restart into the same output or omit failed rows.

`status: passed` means pipeline/count/probe validity, **not native performance acceptance**. During the run, trusted left/right caret keys are dispatched to the empty search field every 300ms (one outstanding request); Linux process RSS is sampled every 500ms. Only `qualifiedObservations` keydown/RSS samples are filtered to lie wholly inside the app's processing window. Raw `interactions.eventTiming.entries` are not window-filtered and must not be aggregated as workload samples. Fast warm runs can legitimately have `availability: unavailable`, count 0 and null timing/RSS summaries. Handler delay and next-frame opportunity are not interaction-to-paint latency; Event Timing entries are thresholded/quantized and not an uncensored interaction distribution. Summed process RSS double-counts shared pages and is a sampled process-footprint proxy, not exact peak or isolated native decoder memory. Keep full interaction, playback/cancellation and human pointer/drag acceptance open.

Before aggregation, call `validateEvidenceSet` on **both** JSONL files: require 120 measured rows, no missing/duplicate/failed cells, correct Chrome/Edge products, consistent per-browser versions and identical corpus/build/runner/probe/revision/resources/order identity. Revalidate each raw report using its configuration and fixed manifest. Retain all pilot/failure files separately. Report medians and min/max/sample counts per cache/configuration; summed overlapping phases are not pipeline wall time.

### Validate and summarize the complete dataset

Run this from the measurement checkout inside the matrix container after both browsers finish (`docker exec -i <owned-container> sh` provides a shell). Change only the explicit input paths for a differently named run. It refuses incomplete/failed/mismatched evidence before producing any summary, revalidates every raw report, and recomputes workload-qualified observations. Save stdout as a new ignored result artifact. The per-run p95 columns are summarized across five runs, not pooled into a new interaction distribution; RSS is the per-run maximum sampled process sum, not a native decoder peak.

```sh
node --input-type=module - /corpus/manifest.json \
  /results/chrome-measured-v2.jsonl /results/edge-measured-v2.jsonl <<'JS'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import {
  validateEvidenceSet, validateReport, validateMeasurements,
  validateTerminalReport, qualifyObservations, summarize, verifyServedBuild,
} from './scripts/videoProcessingBenchmark.mjs'

const [manifestPath, ...paths] = process.argv.slice(2)
if (paths.length !== 2) throw new Error('Both browser JSONL files required')
const manifestBytes = await readFile(manifestPath)
const manifest = JSON.parse(manifestBytes)
const expected = {
  ...manifest.expected,
  acceptedBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
}
const rows = (await Promise.all(paths.map(async path =>
  (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse),
))).flat()
const errors = validateEvidenceSet(rows)
const expectedIdentity = {
  corpusId: 'bbb-sunflower-reference-v1',
  corpusManifestSha256: '04d90eaebbf8a22e04196ca17cb38c2591450f8172fa1c6ff6e575681288745b',
  runnerSha256: 'dcabee26f061a1824b4aa19f5a2c18f2c2a42ddb470a03676a71b57d912f0e2d',
  probeSha256: '3df8d0606a6e54d84e3872c951e67bace430a5b166ce8b0afe3a30779e04bcca',
  declaredAppRevision: '00b7646da247c280c55e97f50d6d972b3116ddd4',
  buildSha256: '25dfed9dc46cb56a8c8a7f5e2195a1ce52eac03c78ca2f4f390adda2798bd1fe',
  resources: { cpuMax: '400000 100000', memoryMax: '4294967296', shmBytes: 1073741824 },
  node: 'v24.20.0', os: 'linux 6.8.0-138-generic x64',
  viewport: { width: 1440, height: 1000 },
  orderProtocol: 'rotating-configurations-v1',
  appUrl: 'http://127.0.0.1:4173',
  cacheScope: 'fresh browser profile for cold; same-profile reload for warm; OS cache not reset',
}
const expectedProducts = { chrome: 'Chrome/152.0.7977.64', edge: 'Edg/152.0.4191.53' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const hashes = {
  corpusManifestSha256: hash(manifestBytes),
  runnerSha256: hash(await readFile('scripts/videoProcessingBenchmark.mjs')),
  probeSha256: hash(await readFile('scripts/videoProcessingProbe.js')),
  buildSha256: await verifyServedBuild(resolve('dist'), expectedIdentity.appUrl),
}
for (const row of rows) {
  const key = JSON.stringify(row.configuration)
  for (const [name, value] of Object.entries(expectedIdentity))
    if (!isDeepStrictEqual(row.identity[name], value))
      errors.push(`${key}: expected ${name} mismatch`)
  if (row.identity.browserVersion.product !== expectedProducts[row.configuration.browser])
    errors.push(`${key}: expected browser product mismatch`)
  for (const [name, value] of Object.entries(hashes))
    if (row.identity[name] !== value) errors.push(`${key}: ${name} mismatch`)
  if (row.identity.corpusId !== manifest.id) errors.push(`${key}: corpus ID`)
  try {
    const reportErrors = [
      ...validateReport(row.report, row.configuration.cache, expected),
      ...validateMeasurements(row.report, row.configuration, expected),
      ...validateTerminalReport(row.report, row.configuration.cache, expected),
    ]
    errors.push(...reportErrors.map(error => `${key}: ${error}`))
    if (!row.ui || row.ui.hiddenDuringRun ||
        !Number.isFinite(row.ui.firstVisibleThumbnailMs))
      errors.push(`${key}: invalid visibility observation`)
    const qualified = qualifyObservations(row.report, row.interactions, row.memory)
    if (!isDeepStrictEqual(qualified, row.qualifiedObservations))
      errors.push(`${key}: qualified observations mismatch`)
  } catch (error) {
    errors.push(`${key}: ${error.message}`)
  }
}
if (errors.length) throw new Error(errors.join('\n'))

const groups = []
for (const browser of ['chrome', 'edge'])
  for (const foreground of [1, 2, 4])
    for (const previews of [1, 2])
      for (const cache of ['cold', 'warm']) {
        const group = rows.filter(row => {
          const c = row.configuration
          return c.browser === browser && c.foreground === foreground &&
            c.previews === previews && c.cache === cache
        })
        const metric = pick => summarize(group.map(pick))
        const phaseTotalMs = {}
        for (const lane of ['foreground', 'previews'])
          for (const phase of ['metadata', 'seek', 'capture', 'encode', 'serialize', 'persistence'])
            phaseTotalMs[`${lane}/${phase}`] = metric(row =>
              row.report.measurements[lane][phase]?.totalMs)
        groups.push({
          browser, foreground, previews, cache, runs: group.length,
          pipelineMs: metric(row => row.report.timing.pipelineElapsedMs),
          foregroundMs: metric(row => row.report.timing.foregroundElapsedMs),
          firstVisibleThumbnailMs: metric(row => row.ui.firstVisibleThumbnailMs),
          maxFrameGapMs: metric(row => row.ui.animationFrames.maxGapMs),
          longTaskTotalMs: metric(row => row.ui.longTasks.supported ? row.ui.longTasks.totalMs : null),
          handlerP95Ms: metric(row => row.qualifiedObservations.handlerDelayMs.p95),
          nextFrameP95Ms: metric(row => row.qualifiedObservations.nextFrameOpportunityMs.p95),
          sampledPeakRssMiB: metric(row => {
            const peak = row.qualifiedObservations.browserProcessRssKiB.max
            return peak === null ? null : peak / 1024
          }),
          interactionSamples: group.reduce((n, row) => n + row.qualifiedObservations.handlerDelayMs.count, 0),
          memorySamples: group.reduce((n, row) => n + row.qualifiedObservations.browserProcessRssKiB.count, 0),
          missedProcesses: group.reduce((n, row) => n + row.memory.missedProcesses, 0),
          phaseTotalMs,
        })
      }
console.log(JSON.stringify({
  validatedRows: rows.length, identities: [rows[0].identity,
    rows.find(row => row.configuration.browser === 'edge').identity], groups,
}, null, 2))
JS
```

### Reference corpus and provenance

The public reference is the Big Buck Bunny Sunflower animated film, not synthetic color bars and not the user's personal workload. [Blender's licence](https://peach.blender.org/about/) permits reuse under CC BY 3.0; the [publisher download directory](https://download.blender.org/demo/movies/BBB/) supplies `bbb_sunflower_2160p_30fps_normal.mp4.zip`. Attribution: **(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org**. The Sunflower file additionally credits Janus Bager Kristensen 2013. Derivatives below are modified cuts/crops/encodings, not unchanged originals.

Archive: 632,204,510 bytes, locally calculated SHA-256 `750b255c6d9fee1e2a03a6716d4f358bca56e9115bf3e06a66162fc5272ae151` (not a publisher-signed checksum). Inspection found one regular safe-path member, 633,016,449 bytes uncompressed, before extraction into a fresh directory. Archive plus prepared media occupy approximately 1.287 GB, below the 3 GiB preparation cap.

| Ordered input | Duration | Stored video | Preparation |
|---|---:|---|---|
| Original Sunflower film | 634.53s | H.264, 3840×2160, 30 fps | Unchanged full source; MP3 stereo and AC3 5.1 audio |
| short-720.mp4 | 12s | H.264, 1280×720 | Source offset 60s; resize |
| medium-1080.mp4 | 45s | H.264, 1920×1080 | Source offset 180s; resize |
| portrait.mp4 | 10s | H.264, 720×1280 | Offset 90s; center crop 1216×2160, resize, square pixels |
| rotation-90.mp4 | 12s | H.264, 1280×720 | Stream copy of short clip; display matrix rotation 90° |
| variable-frame-rate.mp4 | 9.80s | H.264, 1280×720 | Offset 240s; retain first 15 frames of each 30 plus every third frame; preserve timestamps |
| alternate-vp9.webm | 8s | VP9, 1280×720 | Re-encode first 8s of short clip |
| unsupported-mpeg4.mp4 | 2s | MPEG-4 Part 2, 320×180 | Valid container/codec input, unsupported by the qualified browsers |
| malformed.mp4 | — | 69-byte test text | Deliberately invalid media |
| duplicate/short-720.mp4 | 12s | Exact duplicate | Same basename/bytes in a second folder |

Total selection: **10 Files / 654,212,593 bytes**, 7 supported unique videos, 2 skipped-invalid inputs and 1 duplicate. Ordered manifest SHA-256: `04d90eaebbf8a22e04196ca17cb38c2591450f8172fa1c6ff6e575681288745b`. Full original media SHA-256: `37f0ff251a606c2dcfa26c19fe6bf843234b4e7a8889cfab50bc26f644e55520`. The retained local manifest hashes every derivative; source media, full manifest, recipes and raw outputs remain in the ignored task artifacts, outside Git.

Preparation uses only the already-pinned test image's Cypress 16 bundled FFmpeg (`N-47683-g0e8eb07980-static`), not an app dependency. Source cuts use input `-ss`, `-t`, no audio, input/output `-threads 2`, `-filter_threads 1`, `libx264 -preset veryfast -crf 23`; resize with `scale`, portrait with `crop=1216:2160,scale=720:1280,setsar=1`. VFR uses `scale=1280:720,select='lt(mod(n,30),15)+not(mod(n,3))'` and `-vsync vfr`; inspected frame timestamps contain both 33.3ms and 100ms spacing in blocks, not strict alternation. Rotation uses `-c copy -metadata:s:v:0 rotate=90`. VP9 uses `libvpx-vp9 -threads 2 -deadline realtime -cpu-used 6 -b:v 0 -crf 34`; the unsupported case uses `mpeg4` with `scale=320:180`. All outputs use `-n` (no overwrite). Re-generated containers can have different metadata/hashes; freeze and identify a new manifest instead of claiming byte-identical inputs.

The ignored corpus retains `prepare.sh`, `preparation.log` (including original stream metadata), `media-inspection.log` (each derivative and the malformed-input rejection), `vfr-frames.log`, `PROVENANCE.md`, `ATTRIBUTION.md` and `manifest.json`. The duplicate is byte-identical to the inspected short clip. `PROVENANCE.md` records tool identity and inspection commands; do not infer format solely from a filename.

The measured environment uses the pinned official Chrome/Edge image manifest `sha256:4e487953a62c66c9b0ba84e07ecc84089612e213718b2a76c13c98ca66f97bae`, Node 24.20.0, Linux x64, 1440×1000 viewport, **4 CPU quota / 4 GiB memory / 1 GiB shared memory**, headless rendering and disposable profiles. Six logical CPUs remain visible to browser capability reporting; the cgroup quota is four. One init-enabled, externally disconnected container is used serially, with read-only app/corpus binds and a writable results bind; no host ports or Docker volumes. OS disk cache is not cleared and shared-host activity is not controlled, so results are reference observations, not a dedicated-machine or hardware-decoder benchmark.

Recreate the environment only after preparing the fixed corpus and building the measurement checkout. Replace the three absolute paths with task-owned directories; use a fresh container name and fresh output filenames. This is the recorded matrix invocation with host-specific paths parameterized (the exact local invocation is retained in `reference-results/environment.md`):

```sh
BVR_WORKTREE=/absolute/path/to/measurement-checkout
BVR_CORPUS=/absolute/path/to/reference-corpus
BVR_RESULTS=/absolute/path/to/reference-results
docker run -d --rm --init --name bvr-reference-matrix \
  --label codex.task=video-reference-baseline \
  --label "codex.worktree=$BVR_WORKTREE" \
  --network none --cpus 4 --memory 4g --shm-size 1g \
  --mount "type=bind,src=$BVR_WORKTREE,dst=/work,readonly" \
  --mount "type=bind,src=$BVR_CORPUS,dst=/corpus,readonly" \
  --mount "type=bind,src=$BVR_RESULTS,dst=/results" --workdir /work \
  cypress/browsers@sha256:4e487953a62c66c9b0ba84e07ecc84089612e213718b2a76c13c98ca66f97bae \
  tail -f /dev/null
docker exec -d -e HOST=127.0.0.1 -e PORT=4173 bvr-reference-matrix \
  node scripts/productionServer.mjs
docker exec bvr-reference-matrix node scripts/videoProcessingBenchmark.mjs \
  --browser chrome --corpus /corpus --output /results/chrome-measured-v2.jsonl \
  --repetitions 5 --revision 00b7646da247c280c55e97f50d6d972b3116ddd4 &&
docker exec bvr-reference-matrix node scripts/videoProcessingBenchmark.mjs \
  --browser edge --corpus /corpus --output /results/edge-measured-v2.jsonl \
  --repetitions 5 --revision 00b7646da247c280c55e97f50d6d972b3116ddd4
```

After final validation, inspect labels, mounts and process ownership, then stop only this task's exact container. `--rm` removes its disposable writable layer/profiles; the corpus/results bind directories and reusable image remain. No Docker volume or operator data cleanup is part of this protocol.

Initial pilots are retained separately: the two-CPU runs exposed a status-parser error and a real seven-second seek timeout (6 ready/1 failed). Four-CPU qualification passed Chrome 23.506s cold/122ms warm and Edge 25.889s/141ms. A later collection attempt stopped after two valid rows because profile teardown raced a final Chromium network-state write; that incomplete attempt is excluded as a whole. Graceful browser closure plus bounded profile-removal retries were requalified before a fresh matrix. None of these resource/harness changes is an application speedup.

The probe reports the first animation-frame callback that observes a loaded thumbnail intersecting the viewport, maximum animation-frame gap, and bounded long-task count/total/max. `firstVisibleThumbnailMs` is a rendering opportunity observation, **not proof of pixels painted**; `elapsedMs` includes the operator's delay before stopping, so use the app's settled pipeline time for throughput. Keep probe/DevTools overhead identical between variants. Discard UI timing comparisons if `hiddenDuringRun` is true or the gallery was already populated/hidden/filtered at selection.

Long tasks describe main-thread work lasting at least 50 ms, with browser-dependent support; unsupported is reported explicitly, not as zero-cost work. See [MDN Long Tasks](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming). Animation-frame callbacks run before repaint and may pause in hidden tabs; see [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame). The probe stores no task attribution URLs or file data and performs no network/storage calls.

The probe does **not** calculate p95 interaction latency or peak native decoder memory. For those acceptance gates, keep native Performance/Task Manager evidence: run the same documented search, scroll, filter, playback and cancellation interactions during each workload; retain interaction timing distributions and peak process-memory observations privately. Do not substitute frame-gap maxima or a headless Cypress duration for p95 interaction latency. Native pointer/drag/visual acceptance remains separate.

## Verification and result record

Long-task count includes any qualifying task overlapping the measurement window. Its total/max milliseconds are clipped to the selection-to-stop interval, including the initial selection task even if it began before the capture listener. A clipped portion can therefore be less than 50 ms. Do not interpret these numbers as the full duration of boundary-crossing tasks.

- Original synthetic smoke fixtures: 4-second 160×90 blue MP4 and 65-second 160×90 red MP4; provenance in `cypress/fixtures/videos/README.md`. They exercise real metadata, seek, capture, encoding and IndexedDB, but are not a representative throughput corpus.
- Unit regressions cover phase producers, observer failure safety, actual awaited persistence, per-session identity, separate queue wait, shared/requeued jobs, removed/cleared attempts, late callbacks, detached reports, and probe lifecycle.
- `cypress/e2e/example.cy.ts` loads the same opt-in probe in the actual app window and checks real populated phase reports, 18 preview encodes for two videos, settled attempt counts and cached reimport without new media work. No parser/encoder mocks or uncaught-exception suppression.
- Run sequentially: `npm run lint`, `npm run type-check`, `npm exec -- tsc --noEmit -p cypress/e2e/tsconfig.json`, `npm run test:unit -- --maxWorkers=2`, `npm run test:ci -- --maxWorkers=2`, `npm run build`, Chrome smoke, Edge smoke. Use the existing shared environment or one root-owned disposable browser container; no per-agent containers or volumes.
- **App instrumentation checkpoint `00b7646`, not the later reference runner:** local verification on 2026-09-04 passed lint, app/Cypress types, all 323 unit tests, all 323 tests with V8 coverage (73.93% lines), production build and diff whitespace checks. Independent read-only review at that checkpoint had no remaining Critical/Important/Minor findings. Red/green review fixes cover removed/cleared attempt settlement, boundary-crossing long tasks and avoiding report construction/serialization while Diagnostics is closed.
- Actual built Chrome 152.0.7977.64 and Edge 152.0.4191.53 smoke passed under Cypress 16 / Node 24.20.0 in one disposable official browser container, pinned image manifest `sha256:4e487953a62c66c9b0ba84e07ecc84089612e213718b2a76c13c98ca66f97bae`. Limits: 2 CPU, 4 GiB memory, 1 GiB shared memory; only this worktree mounted, no host ports or Docker volumes/operator profiles. Headless workflow durations 5.962s / 6.863s are **test durations, not performance benchmarks**. Browser phase/probe assertions, cached media reuse, filtering, playback and persistence all passed; no screenshots or video recordings were generated.
- The fixed public-reference matrix and its phase attribution are complete below. Personal-workload qualification, full p95 interactions and peak native decoder memory remain **pending**. Task 1 of the broader parallel-processing plan is not fully accepted until those baseline gates are met.

## Public-reference results — 2026-09-04 local / 2026-09-05 UTC

Collection ran from 03:54:22 to 04:22:22 UTC. Both browser commands exited 0 and all **120/120** rows passed the exact combined command above: 60 cold and 60 paired warm runs, no missing/duplicate cells, failed pipelines or mixed identities. Each cold run created 7 videos and 63 preview frames, skipped 2 invalid inputs and deduplicated 1 selection. Each warm run restored the 7 valid videos with no new previews; only the two invalid metadata retries remained. All 120 rows retained the same DOM backend, disabled workers, app build, corpus, runner/probe hashes and fixed resource limits.

The command was also executed against the incomplete matrix and correctly exited nonzero with no summary. Final raw JSONL SHA-256 values are Chrome `776388c9e79e3a0392f51d90b1b4aa66648450ce0d79656c361cb74d04746322` and Edge `f134986600e7bc4deeed82ac099eb14a7c4c7d6263fab634ad9bc6191dac715f`. Retained `validated-summary-v2.json` SHA-256 is `8e360b4dfb3bbe14e4d6104dcd81b4e115bf13921f6f0eb1471a5768f4d64383`; it includes every per-configuration phase/observation summary, not only selected columns below. Runner SHA-256 is `dcabee26f061a1824b4aa19f5a2c18f2c2a42ddb470a03676a71b57d912f0e2d`.

### End-to-end and first-visible results

Each cell is **median [minimum–maximum], n=5**. Cold means a fresh browser catalog/profile, not a flushed OS cache. First-visible is the probe's thumbnail rendering opportunity, not pixel-paint proof. Warm imports are cached workloads, not faster decoding.

| Browser | Foreground / previews | Cold pipeline (s) | Warm pipeline (ms) | Cold first visible thumbnail (s) |
|---|---|---|---|---|
| Chrome | 1 / 1 | 25.957 [24.031–29.360] | 130 [122–164] | 3.203 [3.152–4.913] |
| Chrome | 1 / 2 | 25.324 [25.173–30.279] | 123 [109–153] | 3.105 [3.077–5.529] |
| Chrome | 2 / 1 | 27.810 [26.917–30.423] | 114 [110–136] | 0.291 [0.272–0.643] |
| Chrome | 2 / 2 | 26.459 [23.789–27.733] | 116 [113–127] | 0.335 [0.287–0.366] |
| Chrome | 4 / 1 | 25.467 [25.292–26.346] | 110 [104–134] | 0.722 [0.616–1.058] |
| Chrome | 4 / 2 | 23.814 [21.735–24.799] | 107 [102–127] | 0.724 [0.656–1.149] |
| Edge | 1 / 1 | 26.998 [24.234–33.154] | 151 [141–171] | 3.209 [3.142–5.237] |
| Edge | 1 / 2 | 25.669 [24.320–28.571] | 159 [132–194] | 3.201 [3.174–5.314] |
| Edge | 2 / 1 | 27.737 [26.683–28.425] | 159 [131–197] | 0.259 [0.222–0.368] |
| Edge | 2 / 2 | 26.027 [23.481–29.525] | 133 [131–189] | 0.278 [0.255–0.378] |
| Edge | 4 / 1 | 27.689 [23.575–28.671] | 138 [123–196] | 0.714 [0.592–0.771] |
| Edge | 4 / 2 | 25.196 [23.949–27.085] | 132 [127–152] | 0.613 [0.540–0.751] |

Increasing concurrency was not monotonically faster. Foreground 2 exposed a short video's cover earlier than foreground 1 for this fixed order (the long 4K film is first); foreground 4 did not improve that first-visible median. The 4/2 configuration had the lowest observed pipeline median in each browser, but ranges overlap and shared-host/browser-order effects are uncontrolled. This is not enough to change automatic defaults or claim a general speedup.

### What dominated

Awaited **DOM seek** was the largest recorded elapsed phase in both lanes in **all 60 cold runs**. Across the twelve browser/configuration groups, median foreground seek totals ranged 3.490–8.269s and preview seek totals 18.621–38.471s. Median cover JPEG encoding totals were 0.045–0.270s; preview encoding totals 0.450–1.268s. Preview capture totals were 0.963–1.363s. These are overlapping operation totals, not additive wall-time fractions or CPU profiling; the seek observation includes browser decode/waiting and does not isolate their causes.

This points to seeking/frame extraction as the throughput investigation priority. Bounded image-encoding workers may still help responsiveness, but moving only JPEG encoding is not evidence of a large throughput win. Keep the encoder/lifecycle work small and compare it against this frozen DOM baseline; qualify demuxing/worker-native decoding separately before selecting a new dependency. No worker, concurrency-default, timeout or output change was made for these results.

### Proxy responsiveness and process footprint

Cold rows contain **5,236** complete in-workload caret-key samples and **3,132** complete RSS samples; no process reads were missed. Each row below has five observed runs. Handler values summarize each run's p95, **not** a pooled or full interaction-to-paint distribution. RSS values summarize each run's maximum sampled sum, **not** an exact/native decoder memory peak. All 60 warm rows had zero complete in-workload key/RSS samples: both observations are unavailable, not zero latency or memory.

| Browser | Foreground / previews | Handler-delay p95 (ms), median [min–max] | Sampled peak summed RSS (MiB), median [min–max] | Key / RSS samples |
|---|---|---|---|---|
| Chrome | 1 / 1 | 9.3 [7.4–12.9] | 1804 [1756–1835] | 435 / 260 |
| Chrome | 1 / 2 | 9.5 [7.8–12.0] | 1981 [1977–1987] | 441 / 264 |
| Chrome | 2 / 1 | 11.8 [8.1–14.1] | 1922 [1921–1932] | 468 / 280 |
| Chrome | 2 / 2 | 12.4 [6.4–24.2] | 1922 [1919–1938] | 429 / 256 |
| Chrome | 4 / 1 | 10.9 [6.4–11.8] | 1933 [1923–1959] | 424 / 253 |
| Chrome | 4 / 2 | 14.2 [12.5–22.0] | 1927 [1922–1953] | 392 / 234 |
| Edge | 1 / 1 | 10.5 [8.2–22.2] | 2113 [2000–2155] | 451 / 271 |
| Edge | 1 / 2 | 16.6 [10.0–22.5] | 2167 [2155–2208] | 436 / 262 |
| Edge | 2 / 1 | 9.6 [7.0–11.8] | 2214 [2187–2222] | 457 / 274 |
| Edge | 2 / 2 | 13.9 [11.1–27.2] | 2239 [2235–2252] | 436 / 259 |
| Edge | 4 / 1 | 10.5 [10.1–29.0] | 2214 [2198–2260] | 446 / 267 |
| Edge | 4 / 2 | 12.0 [9.3–15.3] | 2224 [2214–2255] | 421 / 252 |

Cold-run maximum frame gaps ranged 65.9–213.3ms in Chrome and 71.6–181.4ms in Edge; clipped long-task totals ranged 127–530ms and 112–485ms respectively. These reinforce the need for full native interaction checks; low caret-handler p95 does not prove smooth scrolling, playback or pointer dragging. Raw Event Timing entries are not used as workload-qualified acceptance samples.

### Open gates and next work

- Qualify a user-permitted personal workload and native Chrome/Edge search, scrolling, filters, playback, cancellation and pointer/drag behavior. Collect full interaction timing and native process/decoder-memory evidence; reference headless results do not close these gates.
- Retain the current defaults and DOM fallback. The next implementation checkpoint is the existing bounded encoder seam and cancellation/resource lifecycle, with an explicit responsiveness comparison; worker-native seeking/decoding remains a later qualification/dependency decision.
- Integration and immutable preprod deployment require a separate request. Preserve operator catalogs, both unintegrated feature worktrees/private installs, reference media and raw/excluded results.

### Reference-runner verification checkpoint

On 2026-09-04 local, final lint, app/Cypress type checks, **342/342 unit tests across 44 files**, the same 342 tests with V8 coverage (**70.43% lines**), production build and diff whitespace checks passed. Nineteen runner regressions cover enumeration, missing/duplicate/failed evidence, identity, protocol failures, path containment, interruption, phase/count/terminal validation and sample qualification. Coverage includes the new standalone CLI; Vitest does not execute its real browser orchestration, which was separately exercised by both pilots and the complete 120-row matrix. Do not compare coverage percentages across changed source denominators as a product regression.

The cleanup-race repair was independently reviewed and requalified with actual Chrome and Edge cold/warm pilots before the frozen matrix. The final rebuild retained `index-Ce2ffPXi.js` / `index-D5DVMAnx.css`; the summary command verifies the full local/served build hash, not only these filenames. Published runner CI is verified separately from the already-passing `00b7646` instrumentation checkpoint; no deployment is implied by CI image publication.

Final independent read-only review reconstructed the complete summary from all raw rows, checked both tables and all phase/sample/range claims, and confirmed artifact/build hashes and final coverage. No Critical/Important/Minor findings remained. The final documented validator reproduced the saved summary byte-for-byte and rejected in-memory consistently wrong corpus, revision, build, browser and resource identities without changing raw evidence.
