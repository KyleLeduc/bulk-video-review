# Video worker demuxer decision

**Status:** Proposed on 2026-09-05; **owner approval required before installing**. Recommendation: pin `mediabunny` to `1.55.7` for a benchmark-only MP4/H.264 preview qualification spike. This is not a production dependency/backend acceptance decision.

## Options and evidence

| Option | Primary evidence | Tradeoff for this repository |
|---|---|---|
| **Mediabunny 1.55.7 — recommended** | Published package declares MPL-2.0. File input, decoded sample retrieval and disposal are documented APIs. | Less custom decoding/format coordination; broader library, license notices/source-availability handling and internal memory behavior need qualification. |
| MP4Box.js (`mp4box` 2.4.1) | Published package declares BSD-3-Clause and Node >=20.8.1. API exposes incremental input, sample extraction, random-access seeking and sample release. | Narrow MP4-focused alternative, but BVR would own more WebCodecs configuration, reordered-frame selection, decoding/backpressure and resource cleanup code. |
| Keep DOM only | Existing tested adapter, no new dependency. | Useful control and possible incremental tuning; does not test the proposed demux/WebCodecs path. |

Versions and manifests were read directly from the public registry without installation: [Mediabunny 1.55.7](https://registry.npmjs.org/mediabunny/1.55.7), [MP4Box.js 2.4.1](https://registry.npmjs.org/mp4box/2.4.1). Recheck the exact selected version's contents/advisories at installation; do not silently switch to a later release. Published unpacked package size is **not** shipped/gzipped worker bundle cost, which remains unmeasured.

Mediabunny documents lazy input reads, explicit format selection and track decoder configuration. The spike should import only MP4-reading facilities; no format expansion, server extensions, custom codec packages or CDN assets. [Reading media](https://mediabunny.dev/guide/reading-media-files).

Its `VideoSampleSink` offers presentation-timestamp retrieval and sparse timestamp iteration. `CanvasSink` also handles display rotation and reusable canvases. These are promising building blocks, not proof that the exact pinned version meets BVR's work/frame bounds. [Media sinks](https://mediabunny.dev/guide/media-sinks).

`BlobSource` has a configurable cache; `CustomSource` exposes size/range reads, cache size, prefetch policy and disposal. Prefer a guarded original-File source in the spike so requests can be rejected **before** oversized allocation, counters can be observed and reads can be stopped. A source-cache limit alone does not bound parsed indexes, retained packets, decoder queues or native/GPU memory. [Blob source options](https://mediabunny.dev/api/BlobSourceOptions), [custom source options](https://mediabunny.dev/api/CustomSourceOptions).

`Input.dispose()` documents cancellation of input/sink operations and closure of associated decoders. Actual abort latency, late completions and worker termination remain test obligations. [Input disposal](https://mediabunny.dev/api/Input#dispose).

MP4Box.js documents `appendBuffer` with file offsets, `seek(time, true)` for a preceding random-access point, sample callbacks including DTS/CTS, and `releaseUsedSamples`. This is a viable alternative if Mediabunny cannot qualify; it is not permission to install both. [MP4Box.js README](https://github.com/gpac/mp4box.js/blob/v2.4.1/README.md).

## License and packaging gate

Mediabunny's declared license is **MPL-2.0**, not MIT/BSD. Preserve its license and notices and make the exact covered source available with the deployed artifact as required; account for any library modifications explicitly. Review the actual distribution arrangement before shipping. This is a dependency-selection consideration, not legal clearance. [License](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE), [Mozilla's distribution FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

The published Mediabunny manifest lists `@types/dom-webcodecs` (`0.1.13`) and `@types/dom-mediacapture-transform` (`^0.1.11`). Resolve and review the complete lockfile change, type compatibility and bundled output. No source/package audit, installed-version worker test, security clearance or actual bundle-size measurement is claimed by this document. MP4Box.js carries a [BSD-3-Clause license](https://github.com/gpac/mp4box.js/blob/main/LICENSE).

## Required evidence before selection becomes implementation acceptance

1. Explicit owner approval for the named package/version and benchmark-only scope, then a deliberate worktree-private install that does not mutate shared dependencies.
2. Built module-worker import on actual Chrome and Edge; secure-context/decoder/OffscreenCanvas checks inside that worker, no application-wide target/header changes.
3. Guarded range reads on head/tail-index, long-GOP and large public synthetic MP4 fixtures. Prove sparse work, bounded metadata/index and packet retention, output/resource caps and rejection before oversized allocation. Stop if the library cannot satisfy them.
4. Correct frame images and presentation timestamps for H.264 B-frames, VFR, rotation, short/repeated targets and malformed/unsupported inputs. No silent conversion to keyframe-only approximations.
5. Abort during read/decode/encode; input/sample/decoder disposal, deadline termination, stale-message rejection and no abort-to-fallback. Only cleaned-up recoverable failures may fall back once.
6. Record exact locked dependency/source identity, license artifacts, generated worker/JPEG output, raw/gzip bundle delta and all failures. No deployment or speed claim from this read-only evaluation.

**Decision requested:** approve `mediabunny@1.55.7` for this bounded qualification, with DOM retained and no normal-app enablement. If it fails qualification, document that result and revisit the alternative instead of building a bespoke container parser.

See the [experiment design](../plans/2026-09-05-benchmark-webcodecs-design.md) and [first implementation tasks](../plans/2026-09-05-benchmark-webcodecs.md).
