# Video Filter Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add explicit, accessible video filtering and sorting while moving filter state out of the ingestion-heavy video store.

**Architecture:** Keep the existing application use case and pure domain service, but replace the callback-shaped filter contract with explicit typed criteria and sorting. Add a one-way presentation `videoFilterStore` that reads the collection from `videosStore`, owns valid filter state and counts, and supplies `VideoGallery` with the visible list.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Vue Test Utils, scoped CSS

---

## Scope and working assumptions

Implement the staged foundation described in `docs/plans/2026-09-04-video-filter-experience-design.md`:

- Search title and existing tags.
- Add explicit pinned visibility, duration, vote-score, preview-readiness, and sort options.
- Preserve `keep-visible` as the default pinned behavior.
- Add counts, clear behavior, accessible validation, and useful empty states.
- Move filtering out of `videosStore` without refactoring its ingestion or thumbnail scheduling.
- Do not change IndexedDB, metadata extraction, tag editing, or dependencies.
- Do not repair or run dependency-cruiser as part of this work.

Use `@test-driven-development` for Tasks 1–5. Because this changes an internal request contract and presentation-store responsibility, use `@requesting-code-review` after Task 5. Before completion, use `@verification-before-completion` and run every automated command in Task 6.

Work from the repository-managed worktree. If it needs bootstrapping, run:

```bash
npm run worktree -- bootstrap /home/dev1/projects/bulk-video-review/.worktrees/codex-video-filter-plan
```

Do not run `npm install`; the canonical bootstrap links the shared root `node_modules`.

### Task 1: Replace the implicit filter callback with a typed domain query

**Files:**

- Create: `src/domain/services/VideoFilterService.spec.ts`
- Modify: `src/domain/valueObjects/VideoFilterOptions.ts:1-15`
- Modify: `src/domain/valueObjects/index.ts:3-7`
- Modify: `src/domain/services/VideoFilterService.ts:1-74`
- Verify: `src/application/usecases/FilterVideosUseCase.ts:1-12`

**Step 1: Write the failing domain tests**

Create a focused suite with a local builder so domain behavior does not depend on presentation test helpers:

```ts
import { describe, expect, test } from 'vitest'
import type { ParsedVideo } from '@domain/entities'
import { applyFilters } from './VideoFilterService'

const buildVideo = (overrides: Partial<ParsedVideo> = {}): ParsedVideo => ({
  id: 'video-1',
  title: 'Alpha walkthrough.mp4',
  thumb: '',
  duration: 120,
  thumbUrls: [],
  tags: [],
  votes: 0,
  url: '',
  pinned: false,
  ...overrides,
})
```

Cover these cases as separate tests:

1. Empty options retain all videos and default to score-descending order.
2. Search trims and matches title or tags without case sensitivity.
3. Duration and vote bounds are inclusive.
4. Search, duration, score, and preview criteria combine with AND.
5. `ready` requires `thumbUrls.length > 1`; `missing` is the complement.
6. `keep-visible` returns all pinned videos first even when they miss other criteria.
7. `match`, `only`, and `hide` apply the exact semantics in the design document.
8. Each sort option works, including deterministic title then ID tie-breakers.
9. An inverted duration or vote range returns an empty list.
10. The input array is unchanged after filtering and sorting.

Use a representative assertion for compound criteria:

```ts
const result = applyFilters({
  videos: [matching, wrongScore, missingPreviews],
  options: {
    searchQuery: 'demo',
    minDurationSeconds: 60,
    maxDurationSeconds: 180,
    minVotes: 1,
    previewAvailability: 'ready',
    pinnedMode: 'match',
  },
  sortBy: 'title-asc',
})

expect(result.map(({ id }) => id)).toEqual([matching.id])
```

**Step 2: Run the domain suite and verify it fails**

```bash
npx vitest run src/domain/services/VideoFilterService.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the new criteria and sort contract do not exist.

**Step 3: Define the explicit request contract**

Replace `VideoCustomFilter` with unions that enumerate supported behavior:

```ts
import type { ParsedVideo } from '@domain/entities'

export type PinnedVideoMode = 'keep-visible' | 'match' | 'only' | 'hide'
export type PreviewAvailability = 'all' | 'ready' | 'missing'
export type VideoSortOption =
  | 'votes-desc'
  | 'votes-asc'
  | 'duration-asc'
  | 'duration-desc'
  | 'title-asc'

export interface VideoFilterOptions {
  minDurationSeconds?: number
  maxDurationSeconds?: number
  minVotes?: number
  maxVotes?: number
  searchQuery?: string
  pinnedMode?: PinnedVideoMode
  previewAvailability?: PreviewAvailability
}

export interface VideoFilterRequest {
  videos: ParsedVideo[]
  options: VideoFilterOptions
  sortBy?: VideoSortOption
}
```

Update `src/domain/valueObjects/index.ts` to export the three unions plus `VideoFilterOptions` and `VideoFilterRequest`. Remove the `VideoCustomFilter` export.

**Step 4: Implement a pure filter-and-sort pipeline**

Keep helpers private to `VideoFilterService.ts`. Implement this order:

1. Return `[]` for inverted duration or vote ranges.
2. Partition candidates according to `pinnedMode ?? 'keep-visible'`.
3. Match search against normalized title and tags.
4. Apply inclusive duration and vote ranges.
5. Apply preview availability.
6. Sort a copied array using `sortBy ?? 'votes-desc'` and deterministic tie-breakers.
7. For `keep-visible`, sort the protected pinned group and matching unpinned group separately, then concatenate them.

Use an exhaustive sort switch and a shared tie-breaker:

```ts
const byTitleThenId = (a: ParsedVideo, b: ParsedVideo) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
  a.id.localeCompare(b.id)

const sortVideos = (
  videos: ParsedVideo[],
  sortBy: VideoSortOption,
): ParsedVideo[] =>
  [...videos].sort((a, b) => {
    let result = 0

    switch (sortBy) {
      case 'votes-desc':
        result = b.votes - a.votes
        break
      case 'votes-asc':
        result = a.votes - b.votes
        break
      case 'duration-asc':
        result = a.duration - b.duration
        break
      case 'duration-desc':
        result = b.duration - a.duration
        break
      case 'title-asc':
        return byTitleThenId(a, b)
    }

    return result || byTitleThenId(a, b)
  })
```

Do not mutate a video or the request array. `FilterVideosUseCase` should continue to delegate to `applyFilters`; only its inferred request/return types change.

**Step 5: Run the domain suite and type-check**

```bash
npx vitest run src/domain/services/VideoFilterService.spec.ts --exclude '.worktrees/**'
npm run type-check
```

Expected: PASS.

**Step 6: Commit the domain contract**

```bash
git add src/domain/valueObjects/VideoFilterOptions.ts src/domain/valueObjects/index.ts src/domain/services/VideoFilterService.ts src/domain/services/VideoFilterService.spec.ts
git commit -m "feat: define explicit video filter query"
```

### Task 2: Simplify the shared select control before adding more instances

**Files:**

- Create: `src/presentation/components/inputs/SelectDropdown.spec.ts`
- Modify: `src/presentation/components/inputs/SelectDropdown.vue:1-156`

**Step 1: Write failing component tests**

Mount the component with string and numeric options. Assert that it:

- renders a `<label>` connected to a native `<select>`;
- reflects the selected value;
- emits the original typed option value on change, including a number;
- exposes every option to keyboard and assistive technology without opening a custom listbox.

Representative numeric-value test:

```ts
const wrapper = mount(SelectDropdown, {
  props: {
    label: 'Columns',
    selectId: 'column-count',
    selected: 3,
    options: [
      { label: '2 columns', value: 2 },
      { label: '3 columns', value: 3 },
    ],
  },
})

await wrapper.get('select').setValue('2')
expect(wrapper.emitted('select')).toEqual([[2]])
```

**Step 2: Run the component suite and verify it fails**

```bash
npx vitest run src/presentation/components/inputs/SelectDropdown.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the current component renders a button and custom listbox.

**Step 3: Replace the custom listbox with a native select**

Preserve the existing props and `select` event. Resolve the string DOM value back to the matching option so numeric values stay numeric:

```ts
function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const option = props.options.find((item) => String(item.value) === value)

  if (option) {
    emit('select', option.value)
  }
}
```

Remove the open state, global option IDs, focus-out logic, and mouse-only handlers. Restyle the native select to fit the current dark panel; retain a clear `:focus-visible` outline.

**Step 4: Run focused and regression tests**

```bash
npx vitest run src/presentation/components/inputs/SelectDropdown.spec.ts src/presentation/components/layout/FilterPanel.spec.ts --exclude '.worktrees/**'
```

Expected: PASS.

**Step 5: Commit the accessible select**

```bash
git add src/presentation/components/inputs/SelectDropdown.vue src/presentation/components/inputs/SelectDropdown.spec.ts
git commit -m "refactor: use native filter selects"
```

### Task 3: Add a dedicated filter presentation store

**Files:**

- Create: `src/presentation/stores/videoFilterStore.ts`
- Create: `src/presentation/stores/videoFilterStore.spec.ts`
- Modify: `src/presentation/stores/index.ts:1-2`
- Modify: `src/presentation/stores/videosStore.ts:90-183,732-766`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Expose the unfiltered collection from `videosStore`**

Write a failing `videosStore.spec.ts` test asserting that `allVideos` reacts to add, update, and remove operations without imposing a presentation sort.

```bash
npx vitest run src/presentation/stores/videosStore.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because `allVideos` is not exposed.

Add the minimal getter and return it from the store. Keep the legacy filtering members until Task 5 so the running application remains functional between commits:

```ts
const allVideos = computed<ParsedVideo[]>(() => Array.from(videoMap.values()))
```

Run the store suite again and expect PASS.

**Step 2: Write failing filter-store tests**

Create `videoFilterStore.spec.ts`. Use `createPresentationTestContext` with a real filter use case where domain behavior matters:

```ts
const { global } = createPresentationTestContext({
  useCases: {
    filterVideosUseCase: createFilterVideosUseCase(),
  },
})
```

Mount a small harness that creates both stores. Cover:

- defaults and the default score-descending result;
- minute-to-second conversion in the use-case request;
- normalized optional duration and integer vote bounds;
- all pinned and preview modes;
- each sort value;
- active-filter count, counting each range group once;
- `clearFilters()` resetting only filter criteria, not sort;
- total and visible counts;
- reactivity when a video is added, removed, pinned, rescored, or receives previews.

**Step 3: Run the new suite and verify it fails**

```bash
npx vitest run src/presentation/stores/videoFilterStore.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the store does not exist.

**Step 4: Implement `videoFilterStore`**

Use explicit presentation units and defaults:

```ts
type VideoFilterState = {
  searchQuery: string
  minDurationMinutes: number | null
  maxDurationMinutes: number | null
  minVotes: number | null
  maxVotes: number | null
  pinnedMode: PinnedVideoMode
  previewAvailability: PreviewAvailability
}

const createDefaultFilterState = (): VideoFilterState => ({
  searchQuery: '',
  minDurationMinutes: null,
  maxDurationMinutes: null,
  minVotes: null,
  maxVotes: null,
  pinnedMode: 'keep-visible',
  previewAvailability: 'all',
})
```

The store should:

- call `useVideoStore()` and inject `FILTER_VIDEOS_USE_CASE_KEY`;
- own one reactive `filters` object plus `sortBy = ref<VideoSortOption>('votes-desc')`;
- compute a domain request, converting non-null minutes to seconds;
- compute `filteredVideos`, `totalCount`, `visibleCount`, `activeFilterCount`, `durationRangeError`, and `voteRangeError`;
- expose typed setters that reject non-finite or invalid individual inputs;
- implement `clearFilters()` with `Object.assign(filters, createDefaultFilterState())`;
- leave `sortBy` unchanged when clearing filters.

Count active groups, not fields:

```ts
const activeFilterCount = computed(
  () =>
    Number(filters.searchQuery.trim().length > 0) +
    Number(
      filters.minDurationMinutes !== null ||
        filters.maxDurationMinutes !== null,
    ) +
    Number(filters.minVotes !== null || filters.maxVotes !== null) +
    Number(filters.pinnedMode !== 'keep-visible') +
    Number(filters.previewAvailability !== 'all'),
)
```

Export `useVideoFilterStore` from `src/presentation/stores/index.ts`.

**Step 5: Run both store suites**

```bash
npx vitest run src/presentation/stores/videoFilterStore.spec.ts src/presentation/stores/videosStore.spec.ts --exclude '.worktrees/**'
```

Expected: PASS.

**Step 6: Commit the new presentation boundary**

```bash
git add src/presentation/stores/videoFilterStore.ts src/presentation/stores/videoFilterStore.spec.ts src/presentation/stores/videosStore.ts src/presentation/stores/videosStore.spec.ts src/presentation/stores/index.ts
git commit -m "refactor: isolate video filter state"
```

### Task 4: Rebuild the panel around visible state and progressive disclosure

**Files:**

- Modify: `src/presentation/components/layout/FilterPanel.vue:1-292`
- Modify: `src/presentation/components/layout/FilterPanel.spec.ts:1-22`

**Step 1: Write failing interaction and accessibility tests**

Expand the component suite to cover:

- `Showing X of Y videos` and an `aria-live="polite"` result summary;
- active-filter count and disabled/enabled `Clear filters` behavior;
- title/tag search input;
- all pinned-visibility options;
- duration and vote inputs updating valid store state;
- range errors connected with `aria-invalid` and `aria-describedby`;
- all preview and sort options;
- `More filters` and `Sort and view` groups;
- column changes continuing to update `appStateStore.columnCount`;
- the existing panel show/hide behavior.

Seed the collection through `useVideoStore().addVideos(...)` and use the real filter use case so the summary proves end-to-end presentation behavior.

**Step 2: Run the panel suite and verify it fails**

```bash
npx vitest run src/presentation/components/layout/FilterPanel.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the new controls and result feedback are absent.

**Step 3: Bind the panel to `videoFilterStore`**

Replace the filter refs taken from `videoStore` with `videoFilterStore`. Keep `appStateStore` as the authority for panel visibility and columns.

The header should contain:

```vue
<p class="filter-panel__summary" aria-live="polite">
  Showing {{ visibleCount }} of {{ totalCount }} videos
</p>
<button
  type="button"
  class="ghost"
  :disabled="activeFilterCount === 0"
  @click="videoFilterStore.clearFilters()"
>
  Clear filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span>
</button>
```

Use these exact control values:

- Pinned videos: `keep-visible`, `match`, `only`, `hide`.
- Hover previews: `all`, `ready`, `missing`.
- Sort: `votes-desc`, `votes-asc`, `duration-asc`, `duration-desc`, `title-asc`.

Keep search and pinned controls visible. Put duration, vote score, and preview availability in semantic `<details>`/`<summary>` progressive disclosure. Put sort and columns in a separate `Sort and view` section.

Keep numeric draft text local to the component. Use one local parser helper for all four fields so invalid text never enters the store. Duration allows finite values at or above zero; vote score allows finite integers. Synchronize drafts after `clearFilters()`.

For each inverted range, render the store error with a stable ID and connect both inputs using `aria-describedby`; set `aria-invalid="true"` while the error exists.

**Step 4: Make overflow conditional rather than clipping controls**

Retain the current outer `.filter-panel` structure. On desktop, replace blanket `overflow: hidden` with horizontal clipping plus conditional vertical scrolling:

```css
.filter-panel {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.filter-panel.closed {
  overflow: hidden;
}
```

On mobile, restore `overflow: visible` while open and retain the existing collapsed behavior. Add visible `:focus-visible` styles and do not hide focus outlines.

**Step 5: Run panel, select, and type checks**

```bash
npx vitest run src/presentation/components/layout/FilterPanel.spec.ts src/presentation/components/inputs/SelectDropdown.spec.ts --exclude '.worktrees/**'
npm run type-check
```

Expected: PASS.

**Step 6: Commit the panel experience**

```bash
git add src/presentation/components/layout/FilterPanel.vue src/presentation/components/layout/FilterPanel.spec.ts
git commit -m "feat: expand video filter controls"
```

### Task 5: Connect the gallery and remove legacy filter responsibility

**Files:**

- Create: `src/presentation/views/VideoGallery.spec.ts`
- Modify: `src/presentation/views/VideoGallery.vue:1-61`
- Modify: `src/presentation/stores/videosStore.ts:4-21,90-183,701-766`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Write failing gallery-state tests**

Cover three states:

1. With zero loaded videos, render an `Add videos to begin reviewing` message and no filter-clear action.
2. With loaded videos and zero matches, render `No videos match these filters` and a `Clear filters` button.
3. Clicking the button calls `videoFilterStore.clearFilters()` and restores matching cards.

Stub `VideoCard` so tests assert IDs without creating media elements.

**Step 2: Run the gallery suite and verify it fails**

```bash
npx vitest run src/presentation/views/VideoGallery.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the gallery reads legacy store state and has no empty states.

**Step 3: Read visible videos from `videoFilterStore`**

Keep mutation commands in `videoStore`, but read `filteredVideos`, `totalCount`, and `visibleCount` from `videoFilterStore`:

```ts
const videoStore = useVideoStore()
const videoFilterStore = useVideoFilterStore()
const { filteredVideos, totalCount, visibleCount } = storeToRefs(videoFilterStore)
```

Render the empty-state messages before the grid. The filtered-empty button calls `videoFilterStore.clearFilters()`.

**Step 4: Remove filtering and sorting from `videosStore`**

Now that both consumers use `videoFilterStore`, remove only these legacy members:

- `FilterVideosUseCase` import and injected dependency;
- `FILTER_VIDEOS_USE_CASE_KEY` import;
- `minDuration`, `maxDuration`, and `searchQuery` refs;
- `sortByVotes`, `sortByPinned`, and `filteredVideos` computed values;
- `setMinDuration`, `setMaxDuration`, and `setSearchQuery` actions;
- their returned public members.

Keep `allVideos` and every ingestion, thumbnail, voting, pinning, and removal member unchanged.

Update existing store tests to use `allVideos` for collection assertions. Do not move thumbnail or ingestion code as part of this task.

**Step 5: Run all affected presentation tests**

```bash
npx vitest run src/presentation/views/VideoGallery.spec.ts src/presentation/components/layout/FilterPanel.spec.ts src/presentation/stores/videoFilterStore.spec.ts src/presentation/stores/videosStore.spec.ts --exclude '.worktrees/**'
```

Expected: PASS.

**Step 6: Commit the integration and cleanup**

```bash
git add src/presentation/views/VideoGallery.vue src/presentation/views/VideoGallery.spec.ts src/presentation/stores/videosStore.ts src/presentation/stores/videosStore.spec.ts
git commit -m "refactor: route gallery through video filters"
```

### Task 6: Review, verify, and manually accept the complete behavior

**Files:**

- Review: all files changed in Tasks 1–5
- Verify: `docs/plans/2026-09-04-video-filter-experience-design.md`

**Step 1: Request architectural code review**

Use `@requesting-code-review`. Ask the reviewer to focus on:

- one-way store dependency (`videoFilterStore` -> `videosStore`);
- no ingestion or persistence behavior changes;
- explicit domain contract and exhaustive unions;
- pinned-mode semantics and input-array immutability;
- accessibility of native controls, errors, and result updates;
- absence of unnecessary helpers, dependencies, or schema changes.

Address findings with focused tests before continuing.

**Step 2: Run source checks**

```bash
npm run lint
npm run type-check
```

Expected: both exit 0.

**Step 3: Run the complete unit suite once**

```bash
npm run test:unit
```

Expected: all `src` and `scripts` tests pass, with `.worktrees/**` excluded by the package script.

**Step 4: Run the production build**

```bash
npm run build
```

Expected: type-check and Vite production build both exit 0 and emit `dist/`.

Do not substitute `npm run dep-graph`; dependency-cruiser is intentionally outside this task.

**Step 5: Inspect the final diff and repository state**

```bash
git diff --check origin/master...HEAD
git diff --stat origin/master...HEAD
git status --short --branch
```

Expected: no whitespace errors, only planned files changed, and no unrelated or generated artifacts staged.

**Step 6: Perform browser acceptance**

Start only this managed worktree server:

```bash
npm run worktree -- up codex-video-filter-plan
```

Use a sample collection that includes pinned and unpinned videos, mixed-case titles, at least one existing tag, short and long durations, several vote scores, and videos with and without hover previews. Verify:

- every individual criterion and at least two compound combinations;
- all four pinned modes, especially default `keep-visible`;
- all five sort options and deterministic results;
- inclusive duration and vote boundaries;
- invalid and inverted range feedback;
- active count, result count, and clear behavior;
- no-videos and no-matches empty states;
- keyboard-only operation and visible focus;
- desktop behavior at a short viewport height;
- mobile open, closed, and expanded-group behavior.

Stop the managed server after acceptance:

```bash
npm run worktree -- stop codex-video-filter-plan
```

Record any native browser acceptance that could not be performed; unit tests are not a substitute for the visual and keyboard checks.

**Step 7: Commit any review-only corrections, then verify the final SHA**

If review or acceptance required changes, commit only those changes with a focused message. Then run:

```bash
git rev-parse HEAD
git status --short --branch
```

Expected: the feature branch is clean and its exact final SHA is recorded for handoff.
