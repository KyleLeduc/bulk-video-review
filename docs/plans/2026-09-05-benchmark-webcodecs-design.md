# Benchmark WebCodecs preview experiment

**Status:** Proposed next increment; dependency approval and runtime qualification pending. Native DOM measurements are documented, not a WebCodecs result. No package, worker, application default or deployment has changed.

## Why this increment

The [native custom A/B/A/B measurements](../testing/video-processing-performance.md#native-custom-dom-concurrency--2026-09-05) reproduce a roughly 9.45-second later-fresh DOM 2/2 pipeline, versus roughly 11 seconds at 2/1. Seeking remains the largest accumulated preview phase. More overlapping DOM jobs coincided with lower later-run wall time, but not halved completion time. The next experiment should address frame extraction rather than assume image encoding or worker count alone will solve throughput.

Recommended approach: qualify **Mediabunny 1.55.7**, then use it in a benchmark-only module worker for MP4/H.264 previews. Alternatives are MP4Box.js with more application-owned decoder coordination, or a dependency-free DOM-only investigation. The [dependency decision](../decisions/video-worker-demuxer.md) compares these and records the outstanding approval. Do not revive the retired video lab or add FFmpeg/WASM.

This narrows the [earlier worker design](2026-09-04-parallel-video-processing-design.md): preview extraction first, not foreground metadata/covers or a general worker framework. That document's product lifecycle requirements remain prerequisites for eventual normal-app enablement.

## Experiment contract

- Baseline label: **DOM ingestion + DOM previews**. Candidate label: **DOM ingestion + WebCodecs previews (experimental)**. Both use the real store, use cases, persistence and isolated trial database. Do not call the whole pipeline WebCodecs when ingestion remains DOM.
- Keep ingestion at 2 and compare preview job limits 1 and 2. Start with one worker job per slot and at most two slots, with no nested encoder pool. Report requested/effective limits and actual peak jobs. Do not change normal-app auto defaults.
- Use original `File` objects, cloned to the worker without full-file buffering. Worker ownership never includes playback URLs or IndexedDB. Keep source access and backend composition in infrastructure/application ports, not Vue business logic or domain entities.
- Preserve nine ordered targets `floor(duration / 10 * i)`, `i = 1..9`, including repeated targets for short videos. Preserve current display dimensions/aspect, rotation, no-upscale 480-pixel width, JPEG quality 0.72, all-or-nothing preview replacement and existing IDs/votes/pins.
- Qualify ordinary, unencrypted MP4/H.264 first. Filename/MIME and WebCodecs API presence alone do not establish eligibility. Check the actual container, track configuration and decoder support inside the worker. Unknown timing, transforms, HDR handling, fragmented/indexless files or resource limits use a reported DOM fallback until specifically qualified.
- Decode near requested timestamps rather than sequentially traversing a long file. Requested timestamp labels alone cannot prove the captured image is the right frame. Public synthetic frame-number fixtures must validate presentation order, B-frames, VFR, rotation and repeated targets.

## Resource and failure ownership

The qualification spike must establish limits before the candidate becomes selectable. Use guarded range reads, explicit source cache limits, bounded concurrent reads and cumulative work limits. Inspect pinned library behavior for metadata/index retention, sparse decoding and internal queues; an 8 MiB source cache is **not** an 8 MiB total-memory guarantee.

Start with a 1 MiB maximum individual read, 16 MiB combined in-flight/cache input allowance, 128 MiB cumulative read allowance per file job, at most two application-held decoded samples per worker, and 128 MiB estimated app-owned raw allocations across active jobs. These are conservative experiment limits, not measured optima or bounds on native decoder/GPU allocations. Count copies and retained encoded outputs separately; cap returned previews at 16 MiB per job and retain the existing 16 MiB inspection bound per trial. If a limit cannot be enforced or a sample/index allocation cannot be bounded before allocation, reject that path rather than silently expanding the budget. Revisit rejected workload coverage explicitly after the spike.

Use versioned job/generation IDs and fail closed on malformed, duplicate or late messages. Every job owns its input, decoder/sink, samples, canvas and result buffers. Close/dispose them on success and error. Abort never triggers fallback. An active abort gets at most a one-second cleanup grace period before that worker is terminated; retain its slot until cleanup or termination. Bound startup and job deadlines within the existing 120-second trial/10-second cleanup limits.

Only after worker cleanup may a recoverable failure make one DOM attempt. Report candidate attempts, successful worker jobs and fallback reasons/counts separately, including mixed-backend rows. A fallback result must not be presented as successful optimized extraction. Repeated worker failures disable that candidate for the trial rather than restart-looping. Cached trials should create no decoder/worker job.

## Integration boundary after qualification

The current thumbnail port accepts only a URL; the session registry privately owns the original File. Extend the thumbnail source to carry both the original File and existing fallback URL, with explicit session-registry read access. Preserve URL acquisition/release in the existing use case and never fetch the URL into a complete buffer. Adapt the DOM implementation and its tests without changing its behavior.

Add an optional thumbnail-generator dependency to `createVideoServices`, defaulting to the existing DOM adapter. A separate benchmark infrastructure composition constructs the candidate and its disposer; production `container.ts` must not import it. The trial host awaits candidate disposal before closing its database. Do not add a second ingestion scheduler or a separate persistence pipeline.

Extend benchmark protocol/validators together: backend identity, actual lane implementation, worker/fallback counts and bounded resource counters need an explicit versioned contract. Keep old DOM protocol-v2 reports interpretable and never relabel them as candidate runs. The strict reference CLI must either explicitly support the new protocol or continue rejecting it; it must not accidentally accept hybrid output as DOM evidence.

## Comparison and acceptance

Alternate backend order across repetitions, keeping each fresh/cached pair adjacent, the same selected File objects/order, matched job limits, one visible trial at a time and exact build/browser identity. Retain every row. Report all-five medians/ranges and first-use separately; label any later-run subset in advance. Browser/OS caches are shared, so neither backend owns a guaranteed hardware-cold first run. Never pool cached reuse with decoding or exclude failures to manufacture a passing suite.

Measure full pipeline wall time and preview wall time, along with candidate demux/read/decode/draw/encode timings. Accumulated overlapping phase durations are not wall-time percentages. Public-fixture image correctness, custom-file count consistency, native UI responsiveness and process-memory observations are distinct checks. No private filenames, paths, content hashes, embedded metadata, byte-range traces or per-file media details enter exported reports; new counters are aggregate and error reasons allowlisted. Existing selection IDs/exact sizes are not a promise of anonymity.

The first gate is correct bounded extraction and fallback in built Chrome and Edge, not a speedup target. Only then compare the candidate against DOM on the same eligible selection. The existing aspirational 20% median reduction and fallback-regression targets are later promotion criteria, not acceptance already achieved here. The supplied custom report does not identify its codecs, so it does not establish MP4/H.264 coverage.

After local qualification and review, follow the repo's feature-preprod smoke workflow without squashing first; record release authority and exact image/build identity before live changes. Native acceptance remains the owner's visible-tab comparison and image/interaction checks. Do not merge, change production defaults or claim the entire worker roadmap complete based on this experiment.

Execution starts with the [qualification implementation plan](2026-09-05-benchmark-webcodecs.md).
