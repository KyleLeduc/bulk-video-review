<template>
  <aside
    id="video-filter-panel"
    class="filter-panel"
    :class="{ closed: !isFilterPanelOpen }"
    :aria-hidden="isFilterPanelOpen ? undefined : 'true'"
    :inert="isFilterPanelOpen ? undefined : true"
  >
    <header class="filter-panel__header">
      <div class="filter-panel__header-main">
        <div>
          <p class="filter-panel__eyebrow">Review controls</p>
          <h2>Filters</h2>
        </div>
        <button
          type="button"
          class="ghost"
          :aria-label="isFilterPanelOpen ? 'Hide filters' : 'Show filters'"
          @click="closeFilterPanel"
        >
          {{ isFilterPanelOpen ? 'Hide' : 'Show' }}
        </button>
      </div>

      <div class="filter-panel__feedback">
        <p class="filter-panel__results" aria-live="polite">
          Showing {{ visibleCount }} of {{ totalCount }} videos
        </p>
        <button
          type="button"
          class="ghost"
          :disabled="activeFilterCount === 0"
          @click="filterStore.clearFilters()"
        >
          Clear filters<span v-if="activeFilterCount">
            ({{ activeFilterCount }})</span
          >
        </button>
      </div>
    </header>

    <section class="filter-panel__content">
      <div class="control">
        <label for="video-filter-search">Search title or tag</label>
        <input
          id="video-filter-search"
          v-model="searchQuery"
          type="text"
          placeholder="e.g. onboarding walkthrough"
        />
      </div>

      <div class="control">
        <SelectDropdown
          label="Pinned videos"
          select-id="pinned-videos-filter"
          :options="pinnedOptions"
          :selected="filters.pinnedMode"
          @select="selectPinnedMode"
        />
        <p class="hint">Choose whether pinned videos bypass other filters.</p>
      </div>

      <details class="filter-panel__more">
        <summary>More filters</summary>
        <div class="filter-panel__more-content">
          <DualRangeSlider
            id-prefix="duration-filter"
            label="Duration"
            :minimum="0"
            :maximum="durationRangeMaximumMinutes"
            :lower-value="durationLowerValue"
            :upper-value="durationUpperValue"
            :format-value="formatDurationValue"
            @update:lower-value="setDurationLowerValue"
            @update:upper-value="setDurationUpperValue"
          />

          <DualRangeSlider
            id-prefix="vote-filter"
            label="Vote score"
            :minimum="0"
            :maximum="voteRangeMaximum"
            :lower-value="voteLowerValue"
            :upper-value="voteUpperValue"
            :format-value="formatVoteValue"
            @update:lower-value="setVoteLowerValue"
            @update:upper-value="setVoteUpperValue"
          />

          <div class="control">
            <SelectDropdown
              label="Hover previews"
              select-id="hover-previews-filter"
              :options="previewOptions"
              :selected="filters.previewAvailability"
              @select="selectPreviewAvailability"
            />
          </div>
        </div>
      </details>

      <fieldset
        class="filter-panel__sort-view"
        aria-labelledby="sort-view-heading"
      >
        <legend id="sort-view-heading">Sort and view</legend>
        <SelectDropdown
          label="Sort by"
          select-id="video-sort"
          :options="sortOptions"
          :selected="sortBy"
          @select="selectSortBy"
        />
        <SelectDropdown
          label="Columns"
          select-id="column-count"
          :options="columnOptions"
          :selected="appStateStore.columnCount"
          @select="selectColumnCount"
        />
        <p class="hint">Changes apply immediately to the gallery.</p>
      </fieldset>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type {
  PinnedVideoMode,
  PreviewAvailability,
  VideoSortOption,
} from '@domain/valueObjects'
import { useAppStateStore, useVideoFilterStore } from '@presentation/stores'
import DualRangeSlider from '@/presentation/components/inputs/DualRangeSlider.vue'
import SelectDropdown from '@/presentation/components/inputs/SelectDropdown.vue'

type RangeEdge = 'lower' | 'upper'

const filterStore = useVideoFilterStore()
const appStateStore = useAppStateStore()

const {
  filters,
  sortBy,
  totalCount,
  visibleCount,
  activeFilterCount,
  durationRangeMaximumMinutes,
  voteRangeMaximum,
} = storeToRefs(filterStore)
const { isFilterPanelOpen } = storeToRefs(appStateStore)

const pinnedOptions: Array<{ label: string; value: PinnedVideoMode }> = [
  { label: 'Keep pinned visible', value: 'keep-visible' },
  { label: 'Match all filters', value: 'match' },
  { label: 'Pinned only', value: 'only' },
  { label: 'Hide pinned', value: 'hide' },
]

const previewOptions: Array<{ label: string; value: PreviewAvailability }> = [
  { label: 'All videos', value: 'all' },
  { label: 'Preview ready', value: 'ready' },
  { label: 'Preview missing', value: 'missing' },
]

const sortOptions: Array<{ label: string; value: VideoSortOption }> = [
  { label: 'Votes: high to low', value: 'votes-desc' },
  { label: 'Votes: low to high', value: 'votes-asc' },
  { label: 'Duration: shortest first', value: 'duration-asc' },
  { label: 'Duration: longest first', value: 'duration-desc' },
  { label: 'Title: A to Z', value: 'title-asc' },
]

const columnOptions = [
  { label: '2 columns', value: 2 },
  { label: '3 columns', value: 3 },
  { label: '4 columns', value: 4 },
]

const searchQuery = computed({
  get: () => filters.value.searchQuery,
  set: (value: string) => filterStore.setSearchQuery(value),
})

function clampToRange(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, value))
}

const durationUpperValue = computed(() =>
  clampToRange(
    filters.value.maxDurationMinutes ?? durationRangeMaximumMinutes.value,
    durationRangeMaximumMinutes.value,
  ),
)
const durationLowerValue = computed(() =>
  Math.min(
    durationUpperValue.value,
    clampToRange(
      filters.value.minDurationMinutes ?? 0,
      durationRangeMaximumMinutes.value,
    ),
  ),
)
const voteUpperValue = computed(() =>
  clampToRange(
    filters.value.maxVotes ?? voteRangeMaximum.value,
    voteRangeMaximum.value,
  ),
)
const voteLowerValue = computed(() =>
  Math.min(
    voteUpperValue.value,
    clampToRange(filters.value.minVotes ?? 0, voteRangeMaximum.value),
  ),
)

function formatDurationValue(value: number, edge: RangeEdge) {
  const openSuffix =
    edge === 'upper' &&
    durationRangeMaximumMinutes.value > 0 &&
    value === durationRangeMaximumMinutes.value
      ? '+'
      : ''

  return `${value}${openSuffix} min`
}

function formatVoteValue(value: number, edge: RangeEdge) {
  const openSuffix =
    edge === 'upper' &&
    voteRangeMaximum.value > 0 &&
    value === voteRangeMaximum.value
      ? '+'
      : ''

  return `${value}${openSuffix}`
}

function setDurationLowerValue(value: number) {
  filterStore.setMinDurationMinutes(value <= 0 ? null : value)
}

function setDurationUpperValue(value: number) {
  filterStore.setMaxDurationMinutes(
    value >= durationRangeMaximumMinutes.value ? null : value,
  )
}

function setVoteLowerValue(value: number) {
  filterStore.setMinVotes(value <= 0 ? null : value)
}

function setVoteUpperValue(value: number) {
  filterStore.setMaxVotes(value >= voteRangeMaximum.value ? null : value)
}

function selectPinnedMode(value: string | number) {
  filterStore.setPinnedMode(value as PinnedVideoMode)
}

function selectPreviewAvailability(value: string | number) {
  filterStore.setPreviewAvailability(value as PreviewAvailability)
}

function selectSortBy(value: string | number) {
  filterStore.setSortBy(value as VideoSortOption)
}

function selectColumnCount(value: string | number) {
  appStateStore.columnCount = Number(value)
}

function closeFilterPanel(event: MouseEvent) {
  const internalToggle = event.currentTarget as HTMLButtonElement
  const navigationToggle = document.getElementById(
    'filter-panel-navigation-toggle',
  )

  if (navigationToggle) {
    navigationToggle.focus()
  } else {
    internalToggle.blur()
  }

  appStateStore.toggleFilterPanel(false)
}
</script>

<style scoped>
.filter-panel {
  background: radial-gradient(circle at 20% 20%, #1f2a3b, #0e1623 60%);
  color: #e7edf5;
  position: sticky;
  top: 0;
  align-self: start;
  min-height: 100vh;
  height: 100vh;
  padding: 1.5rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  transition:
    width 0.3s ease,
    padding 0.3s ease,
    opacity 0.3s ease;
  width: min(100%, var(--panel-size, 320px));
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.filter-panel.closed {
  width: 0;
  padding: 1.5rem 0 1.5rem 0;
  opacity: 0.2;
  overflow: hidden;
}

.filter-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-panel__header-main,
.filter-panel__feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.filter-panel__eyebrow {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: rgba(231, 237, 245, 0.6);
  margin: 0;
}

h2 {
  margin: 0.1rem 0 0;
}

.filter-panel__results {
  margin: 0;
  color: rgba(231, 237, 245, 0.78);
  font-size: 0.9rem;
}

.filter-panel__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

label {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-weight: 600;
  color: rgba(231, 237, 245, 0.9);
}

input,
button {
  font: inherit;
}

input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background-color: rgba(255, 255, 255, 0.08);
  color: #f2f6fb;
}

input:focus-visible,
button:focus-visible,
summary:focus-visible {
  outline: 2px solid #6ec5ff;
  outline-offset: 2px;
}

.filter-panel__more,
.filter-panel__sort-view {
  min-width: 0;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.filter-panel__more summary {
  padding: 0.75rem;
  color: rgba(231, 237, 245, 0.92);
  font-weight: 700;
  cursor: pointer;
}

.filter-panel__more-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 0.75rem 0.75rem;
}

.filter-panel__sort-view legend {
  padding: 0;
  color: rgba(231, 237, 245, 0.92);
  font-weight: 700;
}

.filter-panel__sort-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}

.filter-panel__sort-view legend {
  padding: 0 0.25rem;
}

.ghost {
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.04);
  color: #f2f6fb;
  cursor: pointer;
}

.ghost:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(231, 237, 245, 0.7);
}

@media (max-width: 900px) {
  .filter-panel {
    position: static;
    height: auto;
    min-height: auto;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow: visible;
  }

  .filter-panel.closed {
    width: 100%;
    height: 0;
    padding: 0;
    overflow: hidden;
  }
}
</style>
