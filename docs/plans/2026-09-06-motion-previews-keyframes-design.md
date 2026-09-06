# Motion previews and seek keyframes — vertical-slice design

## Scope and status

Implementation design for `feat/video-benchmark-view`, inspected at `165bd3df3d1e41fb4ded4bb237461a539f568c0f`. This document does not claim normal-app integration, verification or deployment.

The owner selected **1.5-second clips at 20 FPS** after smoke testing. Motion previews will be **enabled by default** on this feature branch, with owner smoke acceptance before promotion to master. There is no opt-in setting in this slice. Additional speed optimization and broad ingestion restructuring are follow-ups, not integration gates.

The new request supersedes the earlier proposal to continue generating a nine-image slideshow alongside clips. Foreground DOM metadata and cover extraction remain. New background work generates two distinct products:

| DTO output | Consumer | Recipe |
|---|---|---|
| `motionClips` | Gallery thumbnail hover loop | Up to ten sampled clips, 1.5 s, 20 FPS, 320 px maximum dimension, 250 kbit/s, no audio |
| `keyframes` | Main-player seek-bar mouseover | Small JPEGs; one sample per 15 s, capped at 100 samples across the whole source |
| Existing `thumb` | Initial display and motion fallback | Existing DOM cover |

`keyframes` means sampled thumbnail images, **not necessarily codec I-frames**. Each entry has a source timestamp, Blob, width and height. Motion entries additionally carry duration and a video MIME type. Never put video Blobs into still-image arrays. The DTO also carries `previewVersions: { motionClips?: string; keyframes?: string }`, populated only alongside a complete validated product, so readiness can check the actual recipe rather than only array length.

## Sampling decisions

Keep the tested clip positions/count policy while changing its production recipe explicitly to 1.5 s / 20 FPS. The existing legacy benchmark defaults of 3 s / 10 FPS remain unchanged for reproducibility.

Proposed keyframe interpretation:

```ts
function keyframeTargets(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new RangeError('Expected a positive finite duration')
  const count = Math.min(100, Math.ceil(durationSeconds / 15))
  const interval = Math.max(15, durationSeconds / 100)
  return Array.from({ length: count }, (_, index) => index * interval)
}
```

Examples: a 10-second video gets `[0]`; 60 seconds gets `[0, 15, 30, 45]`; 25 minutes gets 100 samples at 15-second intervals; 50 minutes gets 100 samples at 30-second intervals. Exclude the exact media end, avoiding an end-of-stream seek.

All DTO timestamps and sampling targets use **the original main player's playback-time coordinate**, not raw demuxer packet timestamps or each output clip's zero-based time. Translate to/from demuxer coordinates inside the adapter only, using a verified source-timeline mapping. Do not blindly equate the primary track's first packet timestamp with the HTML player's origin. The current experimental clip worker offsets trim windows by its track start and reports those raw starts; the production adapter must normalize appropriately rather than exposing them unexamined. Native fixtures with nonzero timestamps/edit offsets must compare keyframe images against main-player seeks. A timeline that cannot be mapped reliably gets an explicit unsupported-product outcome, not silently misaligned seek thumbnails.

Start with **160 px wide**, maintaining aspect ratio and not upscaling. The companion quality benchmark compares **120 / 160 / 240 px**, with identical timestamps and JPEG quality (initially 0.72). The choice is provisional until owner visual acceptance. A maximum dimension/pixel guard also applies to unusually tall sources.

## Architecture choice

**Recommended: one existing queued job per video, two independently completed products.** Generate missing motion first, then missing keyframes, sequentially inside that job. This preserves the current one-job automatic concurrency, foreground priority, pause/resume and cancellation ownership without another scheduler.

Alternatives considered:

- One all-or-nothing combined clip/image result is simpler to describe but discards useful clips if later keyframe extraction fails, and repeats completed work after focus loss.
- Separate queues or a general worker pool offer more scheduling flexibility but increase ingestion complexity before there is measurement evidence to justify them.

Keep orchestration in application use cases, source/worker/cache operations in infrastructure adapters, wiring in DI and display/scheduling in the existing presentation layer. Promote the reusable extraction implementation out of its benchmark-only location; both the app adapter and benchmark must call the same extraction functions. Do not make normal ingestion depend on benchmark UI, report construction, locks or fixture selection.

The session registry needs a small File accessor. Original Files and object URLs stay session-only. The cached-import path already registers the newly selected File: old entries upgrade on reselection without recreating identity, votes or tags. Database records alone do not authorize or enable reading a user's original file.

## Completion, recovery and fallback

- Track the expected count and recipe version separately for motion and keyframes. Nine legacy stills are not motion readiness, and 100 requested images are not automatically complete merely because some were produced.
- Preserve a previously complete product until a complete, validated replacement has committed. Persist motion before starting keyframes so a focus-loss restart can reuse it.
- Publish each completed product to the in-session DTO through an ownership-checked handoff before starting the next product, independently of cache success. If clips succeed, cache storage fails and keyframes are then aborted, the resume must retain those clips in memory and generate only keyframes. Cache hydration must not overwrite a newer complete in-session product. This handoff carries only the completed product and version, not stale votes/pins or a whole-video replacement.
- Accept partial **product success**, never partial **arrays as complete**. A failed keyframe stage must not erase successful clips; a failed clip stage must not prevent keyframes. Missing motion displays the cover, not the old slideshow.
- The queue must merge successful new fields even if the other product failed, while preserving current votes, pinned state and URL ownership. Readiness, background enqueue checks, duplicate reimports, activity rings and diagnostic text must change together.
- Existing blur/hidden behavior pauses normal background attempts; visible-and-focused recovery restarts only missing products. Intentional cancellation, removal, wipe and replaced attempts must not resurrect cards, write stale completion events or leak URLs.
- Record product-specific failure/unsupported reasons. Do not mark cover-only fallback as successful motion generation or retry unsupported input indefinitely on each hover.
- Gallery “preview ready” filtering means playable motion is available. Keyframes alone and legacy stills must not qualify as motion-ready.
- The seek rail uses the new keyframes array. Existing cached stills may remain readable for rollback but are not silently substituted as the new granular product. With no keyframes, retain the time tooltip and normal seeking.

## Playback UX

Replace the static hover loop without changing the card's open/pin/vote/remove actions or main-player controls. Cycle the clip array on each media `ended` event, including a single-clip loop. Cover remains visible until playback can start and on playback failure.

The thumbnail video is muted, inline, without native controls, pointer interaction, keyboard focus, picture-in-picture, remote playback or fullscreen affordances. Pause when the card leaves the viewport, the page is hidden/unfocused, the card is filtered out or the main player opens. Honor reduced-motion preferences with the cover. Source changes, rejected play promises and late media events must not restart hidden or retired playback.

Keep only needed media decoders active and revoke clip/keyframe object URLs when replaced or the card is removed/unmounted. Encoded DTO/cache size and native decoder memory are separate resource costs.

## Cache and rollback

Use a **separate, versioned, disposable preview cache**, leaving the shared `VideoMetaDataDB` version 4 and legacy records intact. Older releases explicitly open version 4; bumping that database solely for previews would complicate rollback. The new cache stores generated clip and keyframe products, never original Files, blob URLs, votes or authoritative metadata.

Key each complete product by video identity, recipe version and product kind; this avoids a still update overwriting clips. Cache writes must await transaction completion, not merely request success. Version mismatches are misses. Validate cached shapes/counts against the current recipe before declaring readiness.

Bound encoded per-product/per-video output, and use an explicit cache-only byte budget (initial proposal: 256 MiB with oldest-used generated entries evicted). Quota/unavailable-cache errors preserve the cover, review metadata and successful in-session results, with a visible diagnostic. Retry and cache eviction must not turn into automatic regeneration loops. The cache budget is **not a bound on retained DTOs, parser, decoder or GPU memory**.

Include the new cache in explicit wipe-data behavior. Closing a card retains the established catalog/cache semantics; removal cancels active work and releases session resources. Race-test wipe versus pending writes and use ownership/generation checks so completed stale work cannot repopulate wiped data.

Existing isolated pipeline benchmarks must never open or clear the production cache. Retain their explicit legacy-still pipeline until a new versioned full-pipeline workload is intentionally introduced. Extraction-only quality runs remain cache-free.

## Keyframe UX benchmark

Add a self-contained runner preset, provisionally `motion-keyframes-quality-v1`: one fixed 1.5 s / 20 FPS clip step plus three keyframe widths. Generate the clips once, not once per width. Use the production keyframe timestamp policy and one job per configuration, sequentially under the existing benchmark lock.

Show a bounded sample from the same successfully decoded source for all widths: one cycling clip display and an actual seek-rail hover comparison. Keep the primary comparison at the **same production tooltip viewport** (currently `min(180px, 45%)` width), labeling each image's encoded dimensions/bytes; otherwise changing rendered size would confound resolution quality. An optional native-size view is diagnostic only. Prefer one or two representative owner-selected files. A width that fails on that source must remain explicitly failed rather than silently comparing a different file. Do not play/decode displayed samples until all measured extraction is finished.

Reports include recipe/sampling version, requested width, actual per-file target count, returned count, status/reason, output bytes, read metrics and elapsed times. Keep file ordinals/sizes and existing build identity; exclude names, paths, Blob data, object URLs and source timestamps from exported JSON. Samples are bounded, transient and released on reset, new selection, tab switch where appropriate and unmount.

Retain one step-aware sample set per width rather than the current runner's final-still-step-only sample. Fix sample source identity before the run, derive the mixed plan's labels from its workloads rather than a `clips-` prefix, and publish no sample media after interruption.

Preserve Test runner / Manual config separation. The new preset owns all its settings; manual comparison settings do not silently alter it. Keep old 9/100 and duration/FPS reports meaningful. Hidden benchmark work remains `interrupted`, with partial evidence retained; it does not auto-resume into a supposedly uninterrupted timing sample.

## Acceptance and follow-ups

The implementation checkpoint requires targeted tests, lint/types/build, independent boundary review and native Chrome/Edge public-fixture smoke. Owner Windows smoke then covers real motion quality, granular hover recognition, physical tab switching and visible-window focus loss, unsupported-source cover fallback, reselection, reload, cancellation and usable foreground interactions.

No master promotion or deployment is authorized by this design document. Existing parser/decoder allocation limitations remain disclosed; default feature-branch activation is the owner's accepted rollout choice, not proof of hard memory containment. Initial qualification remains AVC/MP4; do not advertise all Mediabunny input formats or unqualified WebM paths.

Record follow-ups for local/NAS read strategy, seek/decode costs, existing queue/backfill simplification, foreground responsiveness and retained Blob/decoder memory. Broader speed comparisons resume after master integration. Rich date provenance, detailed failed-file metadata and FFmpeg WASM stay separate.

Implementation: [task-by-task plan](2026-09-06-motion-previews-keyframes.md).
