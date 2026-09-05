# Custom-file preview extraction comparison

This experimental `/benchmark/` mode compares the current DOM preview extraction with **Mediabunny 1.55.7 + WebCodecs in a disposable worker**. No reference fixtures are needed on the operator PC. It does not change the normal app or its ingestion/preview concurrency defaults.

## Operator steps

1. Open the enabled preprod `/benchmark/` in Chrome or Edge over HTTPS. Select **Custom preview extraction (DOM vs Mediabunny)** in **Benchmark mode**.
2. Select local files once, acknowledge the experimental memory warning, and start with one repetition/a small selection. Choose **Paired DOM vs Mediabunny (serial)**, **DOM only**, or **Mediabunny only**. Standalone modes offer one or two concurrent file jobs; paired mode always uses one. Candidate support is currently MP4/H.264; other formats/codecs fail explicitly without fallback.
3. Keep the tab visible and close competing review/benchmark tabs and heavy work. Hiding the page cancels the run and makes it incomparable. Cancel comparison also stops the current operation; worker termination is covered by lifecycle tests.
4. Images appear only after the run finishes, avoiding sample-image decoding during timed work. Inspect the latest file's nine previews (both methods in paired mode, one in standalone). A passed row validates count, declared dimensions, JPEG type and byte limits, **not identical pixels or decoded frame selection**. Adjacent-frame differences are possible. Human inspection remains necessary.
5. For timing comparison, use the same retained selection and 3–5 repetitions. **Copy JSON** and paste the complete report, including failed rows. If clipboard access fails, the text is selected for Ctrl+C / Cmd+C. No file transfer to the server is required.

## Measurement contract

- Separate report: `mode: preview-extraction-custom-v1`, now **`schemaVersion: 2`**. The existing full-pipeline protocol v2 remains unchanged. Extraction schema 1 did not have stage metrics, batch timing or standalone runs, and displayed samples between jobs; compare versions with that caveat.
- DOM preparation reads metadata once per file before trials and derives nine integer-second targets `floor(duration / 10 * i)` for `i=1..9`; short clips may repeat targets. Preparation wall time is separately recorded, without exporting duration or targets.
- Paired mode: one file/method job at a time. Odd repetitions run DOM then Mediabunny per file; even repetitions reverse this. Standalone: one backend per run, bounded to one or two active files; each repetition fully settles before the next. Fixed file order and shared preparation can still influence caches; no OS/browser cache reset is claimed.
- Every timed job starts a fresh media element or worker. Wall time includes startup, metadata/container work, seek/decode and JPEG encoding. DOM read counters are unavailable (`null`); candidate counters measure source callback requests, not all parser allocations or disk-cache misses.
- Both paths use JPEG quality .72, maximum width 480, no upscaling. Only the latest file's outputs are retained (at most 18 blobs/URLs); sample display is deferred until all measured jobs settle. Display failure is recorded without discarding numeric evidence; partial URLs are revoked.
- These are **extraction-only** numbers: no identification, application persistence, gallery work or result-cache reuse. They are not directly comparable to the prior ~11s DOM 2/1 and ~9.45s DOM 2/2 full-pipeline plateaus. No Mediabunny throughput win has been established yet.

### Stage evidence and throughput

Every successful row includes an allowlisted `metrics` object; failed/aborted rows retain their reason and wall time but have null metrics (no partial-stage proof). Row `startedAtMs`/`finishedAtMs` are offsets from run start, not absolute timestamps; `order` is launch order even if concurrent jobs finish out of order.

- `setupMs`: DOM element startup/metadata validation, or worker input/track/decoder-support setup.
- `extractionMs`: DOM seeks plus canvas capture, or worker iterator retrieval (including reading, demuxing, decoding and drawing). It is **not pure decoder CPU time**.
- `encodeMs`: JPEG encoding elapsed time.
- `cleanupMs`: DOM disposal/revoke calls, or worker Input disposal. These measure API calls, not proof that native GPU/decoder allocations have physically drained. The worker now disposes before publishing its reply; the client then terminates it.
- `totalMs`: adapter elapsed time including setup/extraction/encoding/cleanup. The worker iterator may pipeline work, so stage breakdowns are observations of awaited boundaries rather than exclusive CPU accounting.
- `readMs` / `readMaxMs`: cumulative/max elapsed source callback reads (null for DOM). They are **nested within worker work and may overlap**; do not add readMs to other stages. Byte/call counters are callback requests, not physical disk misses.
- `workerOverheadMs`: nonnegative host elapsed minus worker total (null DOM). Includes startup/module loading, message transport, queueing and host validation; not a pure worker-startup measurement.

For standalone runs, compare **`batches[].wallMs`**, with completion/failure counts and peak active jobs. It measures actual elapsed processing for each repetition, including progress notification/scheduling overhead but excluding shared metadata preparation and final sample display. Do not sum overlapping row times to claim batch throughput. Failed/interrupted batches are not speedup evidence.

### Owner evidence and next test

On build `77f845f`, the owner's retained 20-file selection completed all 160 jobs / 720 frames per backend without failures or hidden-tab invalidation:

| Repetition | First backend | DOM total | Mediabunny total |
|---|---|---:|---:|
| 1 | DOM | 19.3142 s | 20.1836 s |
| 2 | Mediabunny | 10.3484 s | 39.7693 s |
| 3 | DOM | 19.5297 s | 19.9850 s |
| 4 | Mediabunny | 10.3616 s | 39.5246 s |

Both backends were roughly twice as fast in second position. Per-file candidate read counts/bytes stayed constant. This establishes a repeatable order correlation, **not** its cause; all successful candidate files passed the same MP4/AVC gate. Schema-1 aggregate times do not identify whether file reads, decoding, startup or display overlap caused the swings. No native reproduction or fix of that timing pattern is claimed.

Next native check: on the revised build and same retained selection, run DOM only / 1 job and Mediabunny only / 1 job with two repetitions each; copy both reports. Then repeat each with 2 jobs. Keep the tab visible. For confirmation, reverse the order of standalone runs; browser/OS cache state still is not controlled. No more identical schema-1 repetitions are needed.

## Limits and privacy

Two concurrent jobs can roughly double memory pressure; the following limits apply per job, not to total browser or GPU memory. DOM also supports overlapping asynchronous jobs without requiring a worker, while each candidate job owns a worker. Neither implies a dedicated hardware decoder or a guaranteed speedup.

Mediabunny's parser can allocate before the custom read callback and expand compressed indexes; see the [earlier source audit](mediabunny-qualification.md). The owner accepted those limitations for this custom-file experiment. **No hard memory bound or malformed-input security qualification is claimed.** Worker cancellation/timeouts cannot prevent browser/native OOM or an unresponsive main page.

Best-effort limits: 120s per preparation/extraction job, 8 MiB source cache, no prefetch, 16 MiB per callback read, 256 MiB cumulative callback reads per job, 16 MiB JPEG output per job, decoded/display dimensions at most 8192 per axis and 33,554,432 pixels. These may reject otherwise playable large/long-GOP inputs; retain `read-limit` rows. They do not cap parser indexes, internal pending buffers, decoder queues or GPU memory before allocation. The worker reads bounded `File.slice()` ranges, not a direct `File.arrayBuffer()`; a range can still cover an entire small file. No library fork is included.

Files and sample images stay in the browser. Copied JSON contains a random selection ID, 1-based file ordinals, exact file sizes, build/browser identity, settings, preparation/row wall times, output/read counts and allowlisted reason codes. It contains no names, paths, raw exceptions, video/image bytes, content hashes, durations, codec metadata or per-frame target/PTS arrays. **Exact sizes and browser metadata are not guaranteed anonymous.** Selection identity is retained only while the selection remains in this page; it is not content verification.

The browser-wide `bvr-video-benchmark-v1` Web Lock excludes other benchmark modes/tabs, not ordinary review tabs. No catalog database is opened or deleted by this extraction mode.

## Dependency and distribution artifacts

Only the feature worktree has a private dependency install. The former shared symlink was preserved and its target was not changed. The lock pins `mediabunny@1.55.7` and its two type dependencies; no unrelated dependency upgrade was included.

The build packages the unchanged installed Mediabunny source/distribution and original notices into `/third-party/mediabunny/mediabunny-1.55.7.tar.gz`, with the original MPL text and an HTML notice linked by the benchmark. Packaging is offline and deterministic from installed files; it requires GNU tar (present in the production Debian build image). The source archive is approximately 2.14 MB and is not fetched during benchmark startup. The initial built worker is approximately 197 KB raw; exact hashes/sizes belong to each built artifact.

## Automated smoke

Build, start `scripts/productionServer.mjs` with `BVR_BENCHMARK_ENABLED=true`, then run:

```sh
BVR_BENCHMARK_SMOKE=true npx cypress run --browser chrome --spec cypress/e2e/customExtraction.cy.ts
BVR_BENCHMARK_SMOKE=true npx cypress run --browser edge --spec cypress/e2e/customExtraction.cy.ts
```

The smoke uses the repository's two synthetic MP4s on the devbox only. It checks actual DOM and worker extraction, alternating order, 8 paired jobs / 9 frames each, successful stage metrics, decoded sample-image dimensions, private-field absence, clipboard-denial fallback and served source/license assets. It then runs DOM-only and Mediabunny-only with two overlapping jobs each, checks per-batch peak/completion counts, cancels another run and returns to pipeline controls. Unit tests cover deadlines, malformed replies, no fallback, hidden-tab invalidation, cancellation/queue settlement, display failures, launch ordering and cleanup. Native owner hardware/performance and visual acceptance remain separate.
