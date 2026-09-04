# Video Filter Experience Design

**Status:** Proposed design drafted from the current repository and the recommended staged-foundation scope. Richer persisted metadata remains deferred unless the owner expands the scope.

## Purpose

Make a large local video collection easier to narrow and order without adding a generic query framework or mixing more responsibilities into the video ingestion store.

## Current state

The left panel currently offers a case-insensitive title search, minimum and maximum duration inputs, and a column-count preference. Filters update immediately. Pinned videos bypass every filter and remain at the top, but that behavior is explained only by a footer hint.

The implementation crosses the intended layers, but the responsibilities are uneven:

- `FilterPanel.vue` owns input parsing and validation.
- `videosStore.ts` owns filter state and derived results in addition to video collection, ingestion sessions, thumbnail queues, and diagnostics.
- `FilterVideosUseCase` delegates to a pure domain service.
- `VideoFilterOptions` exposes an unused `customFilters` callback contract.
- The domain filter service has no direct test suite; the panel has one structural test.

The persisted model can support title, duration, tag, and vote-score filtering. New videos currently receive no tags. File type, file size, dimensions, and import time are not persisted, so those filters would require a separate metadata and IndexedDB migration project.

## Goals

- Make useful filters discoverable and their effects visible.
- Preserve the existing pinned-video guarantee by default while letting the user choose different pin behavior.
- Add filtering and ordering that use data already available in memory.
- Keep valid filter state separate from form presentation and ingestion orchestration.
- Make the filtering contract explicit, deterministic, and directly tested.
- Keep the panel usable on short desktop viewports and mobile screens.
- Add no dependencies and require no database migration.

## Non-goals

- Persisting filter preferences across browser sessions.
- Adding or editing tags.
- Extracting or persisting file type, size, dimensions, codecs, or import time.
- Server-side filtering or indexing; the collection is already browser-local and in memory.
- Refactoring ingestion, thumbnail scheduling, persistence, or voting behavior.
- Repairing or using dependency-cruiser for verification.

## Experience design

The panel header shows `Showing X of Y videos`, an active-filter badge, and a `Clear filters` action. Clearing filters does not change the selected sort order or column count.

The controls are grouped by purpose:

1. **Search** is always visible and matches both the video title and any existing tags.
2. **Filter** contains pinned visibility and duration. Less common vote-score and preview-readiness controls live in an expandable `More filters` group.
3. **Sort and view** contains ordering and the existing column-count preference. Column count is no longer presented as a filter.

The panel uses native labels, fieldsets, inputs, and selects. `SelectDropdown` keeps its current public props and event but becomes a styled native select, removing the custom listbox's duplicate option IDs and incomplete keyboard behavior.

On desktop, the panel remains sticky. Its content uses vertical overflow only when it is taller than the viewport; it does not restore the removed inner scrolling surface. On mobile, the panel remains in normal document flow and retains the existing show/hide behavior.

The gallery distinguishes two empty states:

- No loaded videos: prompt the user to add videos.
- Loaded videos but no matches: explain that filters hid the collection and offer `Clear filters`.

Result-count text uses an `aria-live="polite"` region. Invalid ranges use visible messages plus `aria-invalid` and `aria-describedby` on the related fields.

## Filter semantics

All range boundaries are inclusive. Different filter groups combine with AND. Search matches title OR any individual tag. Sorting always returns a new array and never mutates the video collection.

| Criterion | Values | Default | Behavior |
|---|---|---|---|
| Search | Free text | Empty | Trim and compare case-insensitively with title and tags |
| Pinned videos | `keep-visible`, `match`, `only`, `hide` | `keep-visible` | Preserve today's bypass by default; other modes make pin behavior explicit |
| Duration | Optional minimum/maximum minutes in UI | Unbounded | Convert to seconds at the presentation boundary |
| Vote score | Optional integer minimum/maximum | Unbounded | Match the persisted `votes` value inclusively |
| Hover previews | `all`, `ready`, `missing` | `all` | Ready means more than one entry in `thumbUrls`, matching current preview readiness |
| Sort | Score high/low, duration short/long, title A-Z | Score high to low | Sort matching videos with deterministic title and ID tie-breakers |

Pinned-mode details:

- `keep-visible`: every pinned video remains visible regardless of other filters and is sorted as a leading group; unpinned videos must match all criteria.
- `match`: pinned and unpinned videos must match all criteria and share one sorted list.
- `only`: only pinned videos are candidates, and they must match the other criteria.
- `hide`: only unpinned videos are candidates, and they must match the other criteria.

An inverted duration or vote range is invalid. The UI displays the error immediately. The domain service remains defensive and returns no matches for that invalid request rather than guessing, swapping bounds, or silently dropping a bound.

## Architecture

Create a `videoFilterStore` as the presentation feature boundary. It owns UI-friendly criteria, the selected sort, validation state, active-filter count, total and visible counts, clearing actions, and the derived visible collection. It depends one way on `videosStore`, which exposes the loaded videos without ordering or filtering them.

Keep `FilterVideosUseCase` and its existing DI wiring because it is the established application boundary. Expand its explicit request contract and keep the domain service pure. Remove `customFilters`; arbitrary executable predicates are unused, cannot be represented as UI state, and make the contract harder to exhaustively test.

The resulting data flow is:

```text
FilterPanel input
  -> videoFilterStore valid UI state
  -> seconds/range normalization
  -> FilterVideosUseCase
  -> pure VideoFilterService
  -> videoFilterStore.filteredVideos and counts
  -> VideoGallery
```

`videosStore` remains the collection and ingestion authority. The filter work removes only its search/duration/filtering/sorting members; splitting ingestion or thumbnail scheduling is separate work.

## Error handling

- Empty numeric inputs mean no bound.
- Duration accepts finite non-negative values; vote score accepts finite integers.
- An invalid individual value is not committed to valid store state.
- Inverted committed bounds surface a range error and yield no matches.
- Unknown filter or sort values are prevented by TypeScript unions; the service uses exhaustive switches so future additions fail visibly during type-checking.
- Clearing filters restores valid defaults and clears range messages.

## Testing and acceptance

Testing is layered so each boundary proves its own responsibility:

- Domain tests cover every criterion, AND/OR behavior, all pinned modes, sort modes, inclusive boundaries, invalid ranges, stable tie-breaking, and input immutability.
- Filter-store tests cover minute-to-second translation, normalization, active-filter counting, clear behavior, result counts, and reactivity to video updates.
- Component tests cover labeled controls, user interaction, validation accessibility, result summary, grouping, and the native select contract.
- Gallery tests cover loaded-empty and filtered-empty states and clearing filters.
- Existing video-store tests are updated to assert collection behavior through the new unfiltered `videos` getter.

Manual acceptance uses a mixed sample set containing pinned and unpinned videos, differing titles, tags, durations, vote scores, and preview readiness. It checks compound filters, every pinned mode, all sort orders, clear behavior, keyboard-only operation, a short desktop viewport, and the mobile layout.

## Deferred follow-up

If filtering by type, size, resolution, codec, or import date becomes important, first define durable metadata semantics and migration/backfill behavior. That work should extend `VideoEntity`, metadata extraction, IndexedDB schema, and cached-record handling before adding controls. The explicit filter contract introduced here provides the extension point without requiring a generic faceting engine now.
