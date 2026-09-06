# Preview recovery and clip UX checkpoint

The owner has accepted a second processing adapter on capability/preview quality.
Further speed benchmarking is deferred until master integration, not a release gate.

## Design

Reuse the existing preview scheduler, abort controllers and retry queue. The normal
app observes visibility and window focus in its presentation lifecycle. Losing
either pauses preview draining and aborts active preview attempts with resumable
ownership; returning to a visible, focused window resumes those same jobs. Display
an explicit paused status. Do not add another ingestion manager or abort an entire
foreground import: metadata/cover cancellation is a separate, unproven failure
boundary and remains outside this change.

Separate usable previews from complete extraction. Two frames remain usable for
display; nine are required for the normal extraction policy. Backfill incomplete
sets, including on hover, and only replace persisted previews after a full new set
is available. Preserve prior previews, playback URLs, votes and pin state. A
same-ID reimport must not suppress repair based on a cached object discarded by
the store. Regenerating one interrupted file is intentionally simpler than
persisting/checkpointing individual frames. Existing complete files are not rerun.

Keep clip refinement benchmark-only. Preserve the existing 10 FPS preset; add a
versioned quality plan at 10/20/24/30 FPS with all other settings unchanged. Retain
one labeled sample per step (maximum four variants, 64 MiB encoded output), outside
JSON and only displayed after the plan ends. Use one muted, inline autoplay video
which advances through the clip array and wraps; no native controls or media click
interaction. External variant and pause/resume controls remain accessible.

Arrange extraction UI as shared files/safety acknowledgment, automatic plan, then
collapsed manual still comparison containing its own settings, actions and results.
Keep technical limits/privacy details in concise disclosures. Automatic and manual
execution remain mutually exclusive. Benchmark hidden-tab abort semantics remain
separate from normal-app pause/resume.

## Alternatives

- Rewrite ingestion around a new global job manager: too broad for this bug.
- Pause inside every DOM helper: implicit policy would affect isolated benchmarks
  and cannot by itself repair persisted incomplete sets.
- Reuse scheduler interruption (chosen): existing ownership and cancellation tests,
  smallest boundary change, one-file restart cost.

## Acceptance

Regression tests cover incomplete sets, pause/retry ownership, repeated focus
events, removal and stale completion. Clip tests cover validated FPS propagation,
bounded labeled samples, array cycling, cleanup and settings independence. Run
targeted tests, full unit/lint/type/build checks sequentially, independent review,
then native browser smoke. Windows real focus/NAS acceptance remains owner-led.
No deployment, master merge or production clip persistence is implied by this
checkpoint.
