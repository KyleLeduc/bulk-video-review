# Dynamic Dual-Range Video Filters Design

## Goal

Replace the duration and vote text fields with custom, accessible dual-handle sliders whose bounds reflect the videos currently loaded in the browser.

## User experience

Duration and vote score each use one horizontal track with two handles. The selected minimum appears above the left side of the track and the selected maximum appears above the right side. Dragging either handle updates the gallery immediately.

The handles retain stable roles and cannot pass each other. They may meet, allowing an exact-value range. Pointer and keyboard interactions use the same clamping rules.

Both controls start at their outer endpoints. The left endpoint is zero and represents no minimum constraint. The right endpoint represents no maximum constraint and uses a `+` label:

- Duration advances in one-minute steps. Its upper bound is the smaller of 60 minutes and the rounded-up duration of the longest loaded video. If the longest video exceeds an hour, the open endpoint reads `60+ min` and includes every video longer than 60 minutes. A shorter library maximum uses a label such as `43+ min`.
- Votes advance in whole-number steps. Their upper bound is the highest non-negative score among all loaded videos, and the open endpoint uses a label such as `12+`.

When no videos are loaded, or every source value resolves to zero, the corresponding control is disabled at `0–0`.

## Dynamic bound behavior

Bounds are derived from the complete loaded-video collection, never from the filtered result. This prevents a filter from shrinking its own selectable range.

An unconstrained upper handle follows the source maximum when videos are added or scores change. A deliberately selected upper limit remains stable while it is valid. When the library shrinks and an active value falls outside the new range, values are clamped without allowing the handles to cross. Removing all videos clears both range filters.

Outer endpoints map to the existing `null` filter state so the default controls remain visually complete without counting as active filters. Moving a handle inward stores a real bound. Clear Filters restores both ranges to their outer endpoints while preserving the existing sort and column behavior.

## Component boundary

Add one presentation component, `DualRangeSlider.vue`, and reuse it for duration and vote score. It owns the track, selected-range fill, handles, pointer capture, keyboard interaction, formatting callbacks, and WAI-ARIA slider attributes. It does not know about videos, duration conversion, Pinia, or domain filtering.

Each handle is independently focusable and exposes its label, current numeric value, formatted value text, and the boundary imposed by the opposite handle. Arrow keys move one step, Page Up and Page Down move five steps, and Home and End move to the nearest permitted endpoint. Visible focus and sufficient handle hit areas are required.

The existing video filter store remains the one-way presentation orchestrator over `videosStore`. It derives source bounds from `videoStore.allVideos`, keeps filter values valid as the collection changes, and continues sending the existing optional bounds to the domain use case. `FilterPanel.vue` supplies display formatting and connects slider changes to store actions.

No domain filtering rule, persistence model, ingestion behavior, deployment contract, or dependency changes.

## Testing

Component tests cover pointer placement, pointer capture, keyboard controls, Home/End, five-step movement, non-crossing handles, equal values, disabled state, formatted labels, selected-track geometry, and ARIA limits/value text.

Store tests cover video-derived maxima, rounded duration minutes, the 60-minute cap, non-negative vote bounds, growth while unconstrained, stable deliberate limits, shrink clamping, empty-library reset, clear behavior, and unchanged domain requests.

Panel integration tests cover both rendered controls, `60+ min` and vote `+` labels, immediate filtering, exact-value ranges, dynamic video changes, clear behavior, active-filter counts, and preservation of the existing pinned/preview/sort/column controls.

Final verification runs focused tests first, then lint, type-check, the complete unit suite, production build, range diff hygiene, and whole-feature review. Native visual and keyboard acceptance remains an explicit owner/browser checkpoint when this environment lacks a browser executable.
