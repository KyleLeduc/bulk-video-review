# Seek benchmark and folder inputs

Approved by the owner's requests for a DOM/Mediabunny seek comparison and recursive folder selection. Reuse the existing extraction lab; do not change production adapters, queue policy, preview recipes, or database data.

## Design

- Add a native directory file input, matching the normal app's recursive `webkitdirectory` selection and shared browser-playable type filter. Keep manual file selection for intentionally unsupported diagnostic sources. List selected file numbers and relative names only behind an explicit private-details toggle; exported reports contain no names or paths. Do not silently truncate or deduplicate selections.
- Add a seek-only preset: 160 px, JPEG 0.72, production every-15-seconds/max-100 targets; DOM and Mediabunny with one and two jobs, then reversed passes. Both include metadata preparation in wall time. Keep the existing quality preset and manual still recipes unchanged. Retain only fixed file 1 samples from first-pass one-job trials for comparison after timing.
- Reuse DOM seeking/capture primitives in the benchmark-only adapter. Bound jobs, deadlines, dimensions and outputs, clean up on cancellation, and report unavailable DOM read counters as null. Failed configurations are diagnostic evidence, not speed wins.
- Preserve allowlisted worker failure evidence in benchmark rows, including the precise timeline guard rejection. The nine-source owner result rejects 36/36 production attempts, whereas legacy clips passed eight. Do not relax the guard without request-coverage qualification; smaller track/player differences are a hypothesis, not proof for these files.

## Alternatives and boundaries

Reusing the whole gallery/ingestion UI would couple the lab to library writes and progress state. A custom recursive filesystem walker adds permission and lifecycle code unnecessarily; the existing native directory input already includes descendants. A new benchmark framework or production fallback change is unnecessary.

The lab measures extraction under the same folder selection, not full ingestion scheduling, persistence or player interaction. Source files remain local; exact technical metadata is not guaranteed anonymous. No FFmpeg repair or cache clearing is part of this change.

## Verification

Failing tests first for directory filtering/mapping/privacy, matched targets and concurrency, cancellation/cleanup, retained failure evidence, and preset/UI routing. Run focused suites, full unit/lint/type/build, independent read-only review, then the authorized existing-preprod workflow. Native file acceptance remains separate.
