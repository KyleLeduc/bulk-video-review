# Dynamic Dual-Range Filters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the duration and vote text inputs with accessible custom dual-handle sliders whose bounds follow all currently loaded videos.

**Architecture:** Add one presentation-only dual-range component with pointer, keyboard, visual-track, and WAI-ARIA behavior. Keep video-derived range policy in the existing filter store, and let the filter panel map outer slider endpoints to the existing nullable domain criteria so default endpoints remain non-filtering.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vue Test Utils, Vitest, scoped CSS.

---

### Task 1: Build the custom dual-range interaction

**Files:**

- Create: `src/presentation/components/inputs/DualRangeSlider.spec.ts`
- Create: `src/presentation/components/inputs/DualRangeSlider.vue`

**Step 1: Write failing semantic and keyboard tests**

Mount the wished-for component with `minimum=0`, `maximum=12`, `lowerValue=2`, `upperValue=10`, `step=1`, and a formatter. Assert:

- the visible edge labels and selected-track percentages;
- two focusable elements with `role="slider"`, distinct accessible names, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and formatted `aria-valuetext`;
- Arrow keys move by one, Page Up/Down by five, and Home/End to the nearest allowed endpoint;
- the lower handle never exceeds the upper value and the upper handle never falls below the lower value;
- equal values are permitted;
- `maximum=0` disables both handles at `0`.

Use emitted `update:lowerValue` and `update:upperValue` events as the component contract. Update wrapper props between key events so each assertion exercises controlled-component behavior.

**Step 2: Run the component test and verify RED**

Run:

```bash
npx vitest run src/presentation/components/inputs/DualRangeSlider.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because `DualRangeSlider.vue` does not exist.

**Step 3: Implement the minimal semantic and keyboard component**

Create a controlled component with these props:

```ts
type Props = {
  idPrefix: string
  label: string
  minimum: number
  maximum: number
  lowerValue: number
  upperValue: number
  step?: number
  formatValue?: (value: number, edge: 'lower' | 'upper') => string
}
```

Render a fieldset/legend, two top value labels, a visual track, a selected-range fill, and two `div` handles with `role="slider"` and `tabindex="0"`. Clamp all keyboard updates against the opposite handle and the external bounds. Use computed percentages for handle positions and the selected fill.

**Step 4: Verify keyboard GREEN**

Run the same targeted test and require all semantic/keyboard assertions to pass without warnings.

**Step 5: Write failing pointer tests**

Stub the track's `getBoundingClientRect()` to a deterministic width. Trigger pointer down/move/up on each handle and assert:

- pointer position rounds to the nearest configured step;
- emitted values clamp to the track bounds and opposite handle;
- optional pointer capture methods are used when the environment provides them.

Expected: FAIL because pointer dragging is not implemented.

**Step 6: Implement pointer dragging and verify GREEN**

Use pointer capture on the active handle, convert `clientX` to the nearest stepped value from the track geometry, and route pointer and keyboard updates through the same clamping helpers. Rerun the component suite.

**Step 7: Commit Task 1**

```bash
git add src/presentation/components/inputs/DualRangeSlider.vue src/presentation/components/inputs/DualRangeSlider.spec.ts
git commit -m "feat: add accessible dual range slider"
```

### Task 2: Derive and normalize video-backed range bounds

**Files:**

- Modify: `src/presentation/stores/videoFilterStore.spec.ts`
- Modify: `src/presentation/stores/videoFilterStore.ts`

**Step 1: Write failing dynamic-bound tests**

Add focused store tests proving:

- duration maximum is `ceil(longestDurationSeconds / 60)`, capped at 60;
- vote maximum is the highest loaded non-negative whole score;
- both maxima are zero with no videos;
- source bounds use `videoStore.allVideos`, not filtered results;
- adding a video grows an unconstrained endpoint automatically;
- active bounds remain stable while valid;
- removing videos clamps/clears out-of-range bounds without producing an inverted range;
- removing all videos clears duration and vote criteria;
- clear filters preserves sort and restores open endpoints.

Name the public computed values `durationRangeMaximumMinutes` and `voteRangeMaximum`.

**Step 2: Run the store suite and verify RED**

Run:

```bash
npx vitest run src/presentation/stores/videoFilterStore.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the computed bounds and collection normalization do not exist.

**Step 3: Implement minimal bound derivation**

Compute maxima from `videoStore.allVideos`:

```ts
const durationRangeMaximumMinutes = computed(() =>
  Math.min(60, Math.ceil(longestDurationSeconds.value / 60)),
)

const voteRangeMaximum = computed(() =>
  Math.max(0, ...videoStore.allVideos.map(({ votes }) => votes)),
)
```

Normalize existing nullable criteria whenever either bound changes. Zero/upper outer endpoints remain represented as `null`; a lower bound clamped to a positive upper endpoint stays active, while an upper criterion at or beyond the new maximum becomes open. Preserve existing validation at the store boundary and keep the domain request unchanged.

**Step 4: Verify store GREEN and regression scope**

Run:

```bash
npx vitest run src/presentation/stores/videoFilterStore.spec.ts src/domain/services/VideoFilterService.spec.ts --exclude '.worktrees/**'
```

Require the new dynamic tests and all existing request/filter behavior to pass.

**Step 5: Commit Task 2**

```bash
git add src/presentation/stores/videoFilterStore.ts src/presentation/stores/videoFilterStore.spec.ts
git commit -m "feat: derive video filter ranges"
```

### Task 3: Replace numeric fields in the filter panel

**Files:**

- Modify: `src/presentation/components/layout/FilterPanel.spec.ts`
- Modify: `src/presentation/components/layout/FilterPanel.vue`

**Step 1: Write failing panel integration tests**

Replace text-field assertions with behavior-level slider assertions. Seed videos with known durations and votes, then prove:

- Duration and Vote score each render one dual-range track and two handles;
- top labels begin at `0 min` / dynamic `N+ min` and `0` / dynamic `N+`;
- a duration over 60 minutes produces `60+ min`;
- moving either handle commits immediately and updates the visible result count;
- an upper handle at its dynamic endpoint maps to `null`, while moving inward creates an active maximum;
- handles may meet for exact-value filtering but never cross;
- adding/removing videos updates the labels and clamps state as designed;
- Clear Filters restores outer endpoints, clears the active range groups, and preserves sort/columns;
- pinned, preview, sort, column, close/focus, and filtered-empty behavior remain intact.

**Step 2: Run the panel suite and verify RED**

Run:

```bash
npx vitest run src/presentation/components/layout/FilterPanel.spec.ts --exclude '.worktrees/**'
```

Expected: FAIL because the panel still renders four text inputs.

**Step 3: Integrate the slider component minimally**

Remove numeric draft parsing, validation messages, clear-action draft synchronization, and the four text inputs. Bind the new store maxima and effective values to two `DualRangeSlider` instances. Map `0` lower values and dynamic upper values to `null` actions, while preserving positive/interior bounds. Format duration in whole minutes with `+ min` on the open upper edge; format votes as whole numbers with `+` on the open upper edge.

Retain the existing progressive disclosure, result feedback, pinned/preview selects, sort/column controls, collapsed-panel accessibility, and focus handoff.

**Step 4: Verify panel GREEN and affected integration tests**

Run:

```bash
npx vitest run src/presentation/components/inputs/DualRangeSlider.spec.ts src/presentation/components/layout/FilterPanel.spec.ts src/presentation/stores/videoFilterStore.spec.ts src/presentation/views/VideoGallery.spec.ts --exclude '.worktrees/**'
```

Require all affected behavior to pass without Vue warnings or console errors.

**Step 5: Commit Task 3**

```bash
git add src/presentation/components/layout/FilterPanel.vue src/presentation/components/layout/FilterPanel.spec.ts
git commit -m "feat: add dynamic filter sliders"
```

### Task 4: Review and verify the whole follow-up

**Files:**

- Review: `src/presentation/components/inputs/DualRangeSlider.vue`
- Review: `src/presentation/stores/videoFilterStore.ts`
- Review: `src/presentation/components/layout/FilterPanel.vue`
- Review: all corresponding specifications

**Step 1: Review requirement and architecture coverage**

Inspect `ed12572...HEAD` and confirm every approved design rule is represented by direct test evidence. Confirm the dependency direction remains `videoFilterStore -> videosStore`, the new component is presentation-only, and no domain, ingestion, persistence, package, deployment, or schema file changed.

**Step 2: Run focused verification**

```bash
npx vitest run src/presentation/components/inputs/DualRangeSlider.spec.ts src/presentation/components/layout/FilterPanel.spec.ts src/presentation/stores/videoFilterStore.spec.ts src/domain/services/VideoFilterService.spec.ts src/presentation/views/VideoGallery.spec.ts --exclude '.worktrees/**'
```

**Step 3: Run repository verification serially**

```bash
npm run lint
npm run type-check
npm run test:unit
npm run build
git diff --check ed12572...HEAD
```

**Step 4: Inspect final Git and runtime-acceptance boundary**

Record the exact SHA, cleanliness, commits ahead of the deployed `3aee956`, and remote relationship. Do not push, merge, deploy, rewrite history, or remove the worktree without explicit owner authorization. If no browser executable is available, leave native pointer/keyboard/visual acceptance open rather than substituting unit tests.
