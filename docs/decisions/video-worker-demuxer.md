# Video worker demuxer decision

**Scope update:** The owner subsequently approved proceeding with experimental **custom-file** benchmarking despite the documented memory-limit gaps. Execute the [revised extraction-only plan](../plans/2026-09-05-custom-mediabunny-benchmark.md). The findings below remain true; they no longer block this explicitly accepted experiment, and still prevent claiming hard memory bounds or production acceptance.

**Current experiment:** The pinned package is now installed privately for the custom extraction comparison. See [operator instructions and exact limits](../testing/custom-mediabunny-benchmark.md). This is not production-backend acceptance or a throughput result.

**Historical audit checkpoint:** Owner approved the proposed `mediabunny@1.55.7` benchmark qualification on 2026-09-05. The pinned-source audit and small synthetic runtime probes then **failed the read/index pre-allocation gate**, before installation. The sections below retain that source-only checkpoint and its original gates; subsequent custom-file authorization is described above. See [qualification evidence and reproduction](../testing/mediabunny-qualification.md).

## Options and evidence

| Option | Primary evidence | Tradeoff for this repository |
|---|---|---|
| **Mediabunny 1.55.7 — approved candidate, stopped at resource gate** | Published package declares MPL-2.0. File input, decoded sample retrieval and disposal are documented APIs. Pinned source/probe demonstrate unchecked per-sample index expansion. | Less custom decoding/format coordination, but the approved pre-allocation bound cannot be enforced through the inspected public API; a limit or explicit scope revision is needed before proceeding. |
| MP4Box.js (`mp4box` 2.4.1) | Published package declares BSD-3-Clause and Node >=20.8.1. API exposes incremental input, sample extraction, random-access seeking and sample release. | Narrow MP4-focused alternative, but BVR would own more WebCodecs configuration, reordered-frame selection, decoding/backpressure and resource cleanup code. |
| Keep DOM only | Existing tested adapter, no new dependency. | Useful control and possible incremental tuning; does not test the proposed demux/WebCodecs path. |

Versions and manifests were read directly from the public registry without installation: [Mediabunny 1.55.7](https://registry.npmjs.org/mediabunny/1.55.7), [MP4Box.js 2.4.1](https://registry.npmjs.org/mp4box/2.4.1). Recheck the exact selected version's contents/advisories at installation; do not silently switch to a later release. Published unpacked package size is **not** shipped/gzipped worker bundle cost, which remains unmeasured.

Mediabunny documents lazy input reads, explicit format selection and track decoder configuration. The spike should import only MP4-reading facilities; no format expansion, server extensions, custom codec packages or CDN assets. [Reading media](https://mediabunny.dev/guide/reading-media-files).

Its `VideoSampleSink` offers presentation-timestamp retrieval and sparse timestamp iteration. `CanvasSink` also handles display rotation and reusable canvases. These are promising building blocks, not proof that the exact pinned version meets BVR's work/frame bounds. [Media sinks](https://mediabunny.dev/guide/media-sinks).

`BlobSource` has a configurable cache; `CustomSource` exposes size/range reads, cache size, prefetch policy and disposal. A guarded original-File callback can reject before `File.slice()`/I/O, observe counters and stop reads. However, the pinned audit confirms that this callback runs **after** Mediabunny allocates a pending-range buffer; a library-level admission limit is needed to meet the planned pre-allocation guarantee. A source-cache limit alone also does not bound parsed indexes, retained packets, decoder queues or native/GPU memory. [Blob source options](https://mediabunny.dev/api/BlobSourceOptions), [custom source options](https://mediabunny.dev/api/CustomSourceOptions), [pinned qualification evidence](../testing/mediabunny-qualification.md).

`Input.dispose()` documents cancellation of input/sink operations and closure of associated decoders. Actual abort latency, late completions and worker termination remain test obligations. [Input disposal](https://mediabunny.dev/api/Input#dispose).

MP4Box.js documents `appendBuffer` with file offsets, `seek(time, true)` for a preceding random-access point, sample callbacks including DTS/CTS, and `releaseUsedSamples`. This is a viable alternative if Mediabunny cannot qualify; it is not permission to install both. [MP4Box.js README](https://github.com/gpac/mp4box.js/blob/v2.4.1/README.md).

## License and packaging gate

Mediabunny's declared license is **MPL-2.0**, not MIT/BSD. Preserve its license and notices and make the exact covered source available with the deployed artifact as required; account for any library modifications explicitly. Review the actual distribution arrangement before shipping. This is a dependency-selection consideration, not legal clearance. [License](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE), [Mozilla's distribution FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

The inspected Mediabunny manifest lists `@types/dom-webcodecs` (`0.1.13`) and `@types/dom-mediacapture-transform` (`^0.1.11`), with no install lifecycle scripts. The archive includes source and MPL-2.0 text. The narrowly scoped npm advisory lookup returned no entries for Mediabunny 1.55.7 on 2026-09-05; this is not security clearance or a resolved transitive audit. No dependency was installed or bundled. If qualification resumes, resolve/review the complete lockfile change, type compatibility, license/source artifacts and bundled output. MP4Box.js carries a [BSD-3-Clause license](https://github.com/gpac/mp4box.js/blob/main/LICENSE).

Concretely: distributing unchanged Mediabunny still requires preserving covered-source notices and informing recipients how to obtain the covered source under MPL. Modifying its covered files adds those modified files to the source that must be available on distribution; it does not automatically relicense separate BVR source files. An external recipient downloading browser JavaScript receives a distribution even when BVR is described as a hosted app; purely internal/private use is different. A future BVR artifact can include third-party notices, the license and an exact corresponding source download. No library is being shipped by this source-only audit, so distribution packaging is deferred, not considered complete. [Mozilla FAQ, Q8–11 and Q16–17](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

## Required evidence before selection becomes implementation acceptance

1. Explicit owner approval for the named package/version and benchmark-only scope, then a deliberate worktree-private install that does not mutate shared dependencies.
2. Built module-worker import on actual Chrome and Edge; secure-context/decoder/OffscreenCanvas checks inside that worker, no application-wide target/header changes.
3. Guarded range reads on head/tail-index, long-GOP and large public synthetic MP4 fixtures. Prove sparse work, bounded metadata/index and packet retention, output/resource caps and rejection before oversized allocation. Stop if the library cannot satisfy them.
4. Correct frame images and presentation timestamps for H.264 B-frames, VFR, rotation, short/repeated targets and malformed/unsupported inputs. No silent conversion to keyframe-only approximations.
5. Abort during read/decode/encode; input/sample/decoder disposal, deadline termination, stale-message rejection and no abort-to-fallback. Only cleaned-up recoverable failures may fall back once.
6. Record exact locked dependency/source identity, license artifacts, generated worker/JPEG output, raw/gzip bundle delta and all failures. No deployment or speed claim from this read-only evaluation.

**Next decision:** retain Mediabunny as a candidate only if reviewed pre-allocation read-buffer and index admission limits can be supplied upstream or through an explicitly approved covered-source change, or explicitly revise the experiment scope. Neither a library fork nor relaxed limits is approved here. MP4Box.js plus WebCodecs is the strongest alternative to evaluate, but must pass the same source/index checks; keep controlled DOM tuning as the dependency-free comparison. FFmpeg/WASM is lower priority unless a specific codec/function gap justifies its different cost and licensing profile. No alternative install or external issue/patch submission is authorized by this audit.

See the [experiment design](../plans/2026-09-05-benchmark-webcodecs-design.md) and [first implementation tasks](../plans/2026-09-05-benchmark-webcodecs.md).
