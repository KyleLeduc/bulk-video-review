import { defineStore } from 'pinia'
import { computed, inject, reactive, readonly, ref, watch } from 'vue'
import type { FilterVideosUseCase } from '@app/usecases'
import type {
  PinnedVideoMode,
  PreviewAvailability,
  VideoFilterRequest,
  VideoSortOption,
} from '@domain/valueObjects'
import { FILTER_VIDEOS_USE_CASE_KEY } from '@presentation/di/injectionKeys'
import { useVideoStore } from './videosStore'

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

const isValidDurationBound = (value: number | null) =>
  value === null || (Number.isFinite(value) && value >= 0)

const isValidVoteBound = (value: number | null) =>
  value === null || Number.isInteger(value)

export const useVideoFilterStore = defineStore('videoFilters', () => {
  const videoStore = useVideoStore()
  const filterVideosUseCase = inject<FilterVideosUseCase>(
    FILTER_VIDEOS_USE_CASE_KEY,
  )

  if (!filterVideosUseCase) {
    throw new Error('FilterVideosUseCase dependency is missing')
  }

  const filterState = reactive<VideoFilterState>(createDefaultFilterState())
  const filters = readonly(filterState)
  const sortBy = ref<VideoSortOption>('votes-desc')

  const durationRangeMaximumMinutes = computed(() => {
    const longestDurationSeconds = videoStore.allVideos.reduce(
      (longest, { duration }) =>
        Number.isFinite(duration) ? Math.max(longest, duration) : longest,
      0,
    )

    return Math.min(60, Math.ceil(longestDurationSeconds / 60))
  })
  const voteRangeMaximum = computed(() =>
    videoStore.allVideos.reduce(
      (highest, { votes }) =>
        Number.isInteger(votes) ? Math.max(highest, votes) : highest,
      0,
    ),
  )

  function normalizeRangeCriteria(
    rangeMaximum: number,
    minimumKey: 'minDurationMinutes' | 'minVotes',
    maximumKey: 'maxDurationMinutes' | 'maxVotes',
  ) {
    if (rangeMaximum === 0) {
      filterState[minimumKey] = null
      filterState[maximumKey] = null
      return
    }

    const currentMaximum = filterState[maximumKey]
    const normalizedMaximum =
      currentMaximum !== null && currentMaximum >= rangeMaximum
        ? null
        : currentMaximum
    const effectiveMaximum = normalizedMaximum ?? rangeMaximum
    const currentMinimum = filterState[minimumKey]
    const normalizedMinimum =
      currentMinimum !== null && currentMinimum > effectiveMaximum
        ? effectiveMaximum
        : currentMinimum

    filterState[minimumKey] = normalizedMinimum
    filterState[maximumKey] = normalizedMaximum
  }

  watch(
    durationRangeMaximumMinutes,
    (rangeMaximum) =>
      normalizeRangeCriteria(
        rangeMaximum,
        'minDurationMinutes',
        'maxDurationMinutes',
      ),
    { flush: 'sync' },
  )
  watch(
    voteRangeMaximum,
    (rangeMaximum) =>
      normalizeRangeCriteria(rangeMaximum, 'minVotes', 'maxVotes'),
    { flush: 'sync' },
  )

  const filterRequest = computed<VideoFilterRequest>(() => ({
    videos: [...videoStore.allVideos],
    options: {
      searchQuery: filterState.searchQuery.trim() || undefined,
      minDurationSeconds:
        filterState.minDurationMinutes === null
          ? undefined
          : filterState.minDurationMinutes * 60,
      maxDurationSeconds:
        filterState.maxDurationMinutes === null
          ? undefined
          : filterState.maxDurationMinutes * 60,
      minVotes: filterState.minVotes ?? undefined,
      maxVotes: filterState.maxVotes ?? undefined,
      pinnedMode: filterState.pinnedMode,
      previewAvailability: filterState.previewAvailability,
    },
    sortBy: sortBy.value,
  }))

  const filteredVideos = computed(() =>
    filterVideosUseCase.execute(filterRequest.value),
  )
  const totalCount = computed(() => videoStore.allVideos.length)
  const visibleCount = computed(() => filteredVideos.value.length)
  const activeFilterCount = computed(
    () =>
      Number(filterState.searchQuery.trim().length > 0) +
      Number(
        filterState.minDurationMinutes !== null ||
          filterState.maxDurationMinutes !== null,
      ) +
      Number(filterState.minVotes !== null || filterState.maxVotes !== null) +
      Number(filterState.pinnedMode !== 'keep-visible') +
      Number(filterState.previewAvailability !== 'all'),
  )
  const durationRangeError = computed(() =>
    filterState.minDurationMinutes !== null &&
    filterState.maxDurationMinutes !== null &&
    filterState.minDurationMinutes > filterState.maxDurationMinutes
      ? 'Minimum duration cannot exceed maximum duration.'
      : null,
  )
  const voteRangeError = computed(() =>
    filterState.minVotes !== null &&
    filterState.maxVotes !== null &&
    filterState.minVotes > filterState.maxVotes
      ? 'Minimum votes cannot exceed maximum votes.'
      : null,
  )

  function setSearchQuery(value: string) {
    filterState.searchQuery = value
  }

  function setMinDurationMinutes(value: number | null) {
    if (isValidDurationBound(value)) {
      filterState.minDurationMinutes = value
    }
  }

  function setMaxDurationMinutes(value: number | null) {
    if (isValidDurationBound(value)) {
      filterState.maxDurationMinutes = value
    }
  }

  function setMinVotes(value: number | null) {
    if (isValidVoteBound(value)) {
      filterState.minVotes = value
    }
  }

  function setMaxVotes(value: number | null) {
    if (isValidVoteBound(value)) {
      filterState.maxVotes = value
    }
  }

  function setPinnedMode(value: PinnedVideoMode) {
    filterState.pinnedMode = value
  }

  function setPreviewAvailability(value: PreviewAvailability) {
    filterState.previewAvailability = value
  }

  function setSortBy(value: VideoSortOption) {
    sortBy.value = value
  }

  function clearFilters() {
    Object.assign(filterState, createDefaultFilterState())
  }

  return {
    filters,
    sortBy,
    filteredVideos,
    totalCount,
    visibleCount,
    durationRangeMaximumMinutes,
    voteRangeMaximum,
    activeFilterCount,
    durationRangeError,
    voteRangeError,
    setSearchQuery,
    setMinDurationMinutes,
    setMaxDurationMinutes,
    setMinVotes,
    setMaxVotes,
    setPinnedMode,
    setPreviewAvailability,
    setSortBy,
    clearFilters,
  }
})
