import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFilterVideosUseCase } from '@app/usecases'
import type {
  PinnedVideoMode,
  PreviewAvailability,
  VideoFilterRequest,
  VideoSortOption,
} from '@domain/valueObjects'
import { useVideoFilterStore, useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'

const StoreHarness = defineComponent({
  name: 'VideoFilterStoreHarness',
  setup() {
    const videoStore = useVideoStore()
    const filterStore = useVideoFilterStore()

    return { filterStore, videoStore }
  },
  template: '<div />',
})

type PresentationTestOverrides = NonNullable<
  Parameters<typeof createPresentationTestContext>[0]
>

type HarnessStores = {
  filterStore: ReturnType<typeof useVideoFilterStore>
  videoStore: ReturnType<typeof useVideoStore>
}

const mountStores = (overrides: PresentationTestOverrides = {}) => {
  const context = createPresentationTestContext({
    ...overrides,
    useCases: {
      filterVideosUseCase: createFilterVideosUseCase(),
      ...(overrides.useCases ?? {}),
    },
  })
  const wrapper = mount(StoreHarness, { global: context.global })
  const stores = wrapper.vm as unknown as HarnessStores

  return {
    ...context,
    filterStore: stores.filterStore,
    videoStore: stores.videoStore,
  }
}

const ids = (videos: ReturnType<typeof buildParsedVideo>[]) =>
  videos.map(({ id }) => id)

describe('useVideoFilterStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('starts with exact defaults and returns the default votes-desc result', () => {
    const { filterStore, videoStore } = mountStores()

    videoStore.addVideos([
      buildParsedVideo({ id: 'unpinned-high', votes: 10 }),
      buildParsedVideo({ id: 'pinned-low', votes: 1, pinned: true }),
      buildParsedVideo({ id: 'unpinned-low', votes: 2 }),
      buildParsedVideo({ id: 'pinned-high', votes: 5, pinned: true }),
    ])

    expect(filterStore.filters).toEqual({
      searchQuery: '',
      minDurationMinutes: null,
      maxDurationMinutes: null,
      minVotes: null,
      maxVotes: null,
      pinnedMode: 'keep-visible',
      previewAvailability: 'all',
    })
    expect(filterStore.sortBy).toBe('votes-desc')
    expect(ids(filterStore.filteredVideos)).toEqual([
      'pinned-high',
      'pinned-low',
      'unpinned-high',
      'unpinned-low',
    ])
  })

  test('derives range maxima from loaded durations and non-negative vote scores', () => {
    const { filterStore, videoStore } = mountStores()

    expect(filterStore.durationRangeMaximumMinutes).toBe(0)
    expect(filterStore.voteRangeMaximum).toBe(0)

    videoStore.addVideos([
      buildParsedVideo({ id: 'partial-minute', duration: 61, votes: -4 }),
    ])

    expect(filterStore.durationRangeMaximumMinutes).toBe(2)
    expect(filterStore.voteRangeMaximum).toBe(0)

    videoStore.addVideos([
      buildParsedVideo({ id: 'longest', duration: 60 * 60 + 1, votes: 14 }),
      buildParsedVideo({ id: 'lower-score', duration: 120, votes: 9 }),
    ])

    expect(filterStore.durationRangeMaximumMinutes).toBe(60)
    expect(filterStore.voteRangeMaximum).toBe(14)
  })

  test('derives range maxima from all videos instead of the filtered result', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({
        id: 'visible-short',
        title: 'match',
        duration: 60,
        votes: 1,
      }),
      buildParsedVideo({
        id: 'filtered-long',
        title: 'hidden',
        duration: 11 * 60,
        votes: 12,
      }),
    ])

    filterStore.setPinnedMode('match')
    filterStore.setSearchQuery('match')

    expect(ids(filterStore.filteredVideos)).toEqual(['visible-short'])
    expect(filterStore.durationRangeMaximumMinutes).toBe(11)
    expect(filterStore.voteRangeMaximum).toBe(12)
  })

  test('grows open ranges while preserving deliberate bounds that remain valid', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({ id: 'initial', duration: 5 * 60, votes: 5 }),
    ])

    expect(filterStore.durationRangeMaximumMinutes).toBe(5)
    expect(filterStore.voteRangeMaximum).toBe(5)
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(filterStore.filters.maxVotes).toBeNull()

    videoStore.addVideos([
      buildParsedVideo({ id: 'growth', duration: 10 * 60, votes: 10 }),
    ])

    expect(filterStore.durationRangeMaximumMinutes).toBe(10)
    expect(filterStore.voteRangeMaximum).toBe(10)
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(filterStore.filters.maxVotes).toBeNull()

    filterStore.setMinDurationMinutes(2)
    filterStore.setMaxDurationMinutes(8)
    filterStore.setMinVotes(3)
    filterStore.setMaxVotes(9)
    videoStore.addVideos([
      buildParsedVideo({ id: 'more-growth', duration: 15 * 60, votes: 15 }),
    ])

    expect(filterStore.filters.minDurationMinutes).toBe(2)
    expect(filterStore.filters.maxDurationMinutes).toBe(8)
    expect(filterStore.filters.minVotes).toBe(3)
    expect(filterStore.filters.maxVotes).toBe(9)
  })

  test('normalizes out-of-range criteria when loaded-video maxima shrink', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({ id: 'remaining', duration: 5 * 60, votes: 4 }),
      buildParsedVideo({ id: 'removed', duration: 20 * 60, votes: 12 }),
    ])
    filterStore.setMinDurationMinutes(10)
    filterStore.setMaxDurationMinutes(15)
    filterStore.setMinVotes(8)
    filterStore.setMaxVotes(10)

    videoStore.removeVideo('removed')

    expect(filterStore.durationRangeMaximumMinutes).toBe(5)
    expect(filterStore.voteRangeMaximum).toBe(4)
    expect(filterStore.filters.minDurationMinutes).toBe(5)
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(filterStore.filters.minVotes).toBe(4)
    expect(filterStore.filters.maxVotes).toBeNull()
    expect(filterStore.durationRangeError).toBeNull()
    expect(filterStore.voteRangeError).toBeNull()
  })

  test('preserves valid range criteria when removing unpinned videos retains range sources', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({
        id: 'retained-pinned',
        duration: 10 * 60,
        votes: 8,
        pinned: true,
      }),
      buildParsedVideo({
        id: 'removed-unpinned',
        duration: 20 * 60,
        votes: 12,
      }),
    ])
    filterStore.setMinDurationMinutes(3)
    filterStore.setMaxDurationMinutes(7)
    filterStore.setMinVotes(2)
    filterStore.setMaxVotes(6)

    videoStore.removeAllUnpinned()

    expect(ids([...videoStore.allVideos])).toEqual(['retained-pinned'])
    expect(filterStore.durationRangeMaximumMinutes).toBe(10)
    expect(filterStore.voteRangeMaximum).toBe(8)
    expect(filterStore.filters.minDurationMinutes).toBe(3)
    expect(filterStore.filters.maxDurationMinutes).toBe(7)
    expect(filterStore.filters.minVotes).toBe(2)
    expect(filterStore.filters.maxVotes).toBe(6)
  })

  test('clears all range criteria when no videos remain', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({ id: 'only-video', duration: 10 * 60, votes: 7 }),
    ])
    filterStore.setMinDurationMinutes(2)
    filterStore.setMaxDurationMinutes(8)
    filterStore.setMinVotes(1)
    filterStore.setMaxVotes(6)

    videoStore.removeVideo('only-video')

    expect(filterStore.durationRangeMaximumMinutes).toBe(0)
    expect(filterStore.voteRangeMaximum).toBe(0)
    expect(filterStore.filters.minDurationMinutes).toBeNull()
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(filterStore.filters.minVotes).toBeNull()
    expect(filterStore.filters.maxVotes).toBeNull()
  })

  test('exposes filter criteria as readonly while setters update committed state', () => {
    const { filterStore } = mountStores()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const attemptedMutation = filterStore.filters as {
      minDurationMinutes: number | null
    }

    attemptedMutation.minDurationMinutes = -1

    expect(filterStore.filters.minDurationMinutes).toBeNull()

    filterStore.setMinDurationMinutes(2)

    expect(filterStore.filters.minDurationMinutes).toBe(2)
  })

  test('maps normalized criteria to the domain request without losing zero or integer bounds', () => {
    const execute = vi.fn((request: VideoFilterRequest) => request.videos)
    const { filterStore, videoStore } = mountStores({
      useCases: { filterVideosUseCase: { execute } },
    })
    videoStore.addVideos([buildParsedVideo({ id: 'mapped' })])

    filterStore.setSearchQuery('   ')
    filterStore.setMinDurationMinutes(0)
    filterStore.setMaxDurationMinutes(null)
    filterStore.setMinVotes(0)
    filterStore.setMaxVotes(null)
    filterStore.setPinnedMode('match')
    filterStore.setPreviewAvailability('missing')
    filterStore.setSortBy('duration-asc')

    expect(ids(filterStore.filteredVideos)).toEqual(['mapped'])
    expect(execute).toHaveBeenLastCalledWith({
      videos: videoStore.allVideos,
      options: {
        searchQuery: undefined,
        minDurationSeconds: 0,
        maxDurationSeconds: undefined,
        minVotes: 0,
        maxVotes: undefined,
        pinnedMode: 'match',
        previewAvailability: 'missing',
      },
      sortBy: 'duration-asc',
    })

    filterStore.setMinDurationMinutes(null)
    filterStore.setMaxDurationMinutes(2.5)
    filterStore.setMinVotes(-3)
    filterStore.setMaxVotes(7)

    expect(ids(filterStore.filteredVideos)).toEqual(['mapped'])
    expect(execute).toHaveBeenLastCalledWith({
      videos: videoStore.allVideos,
      options: {
        searchQuery: undefined,
        minDurationSeconds: undefined,
        maxDurationSeconds: 150,
        minVotes: -3,
        maxVotes: 7,
        pinnedMode: 'match',
        previewAvailability: 'missing',
      },
      sortBy: 'duration-asc',
    })
  })

  test('duration setters accept null or finite non-negative values and retain valid state after invalid input', () => {
    const { filterStore } = mountStores()

    filterStore.setMinDurationMinutes(1.5)
    filterStore.setMaxDurationMinutes(8)

    for (const invalid of [Number.NaN, Infinity, -Infinity, -0.5]) {
      filterStore.setMinDurationMinutes(invalid)
      filterStore.setMaxDurationMinutes(invalid)
      expect(filterStore.filters.minDurationMinutes).toBe(1.5)
      expect(filterStore.filters.maxDurationMinutes).toBe(8)
    }

    filterStore.setMinDurationMinutes(0)
    filterStore.setMaxDurationMinutes(null)

    expect(filterStore.filters.minDurationMinutes).toBe(0)
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
  })

  test('vote setters accept null or finite integers and retain valid state after invalid input', () => {
    const { filterStore } = mountStores()

    filterStore.setMinVotes(-4)
    filterStore.setMaxVotes(9)

    for (const invalid of [1.5, Number.NaN, Infinity, -Infinity]) {
      filterStore.setMinVotes(invalid)
      filterStore.setMaxVotes(invalid)
      expect(filterStore.filters.minVotes).toBe(-4)
      expect(filterStore.filters.maxVotes).toBe(9)
    }

    filterStore.setMinVotes(0)
    filterStore.setMaxVotes(null)

    expect(filterStore.filters.minVotes).toBe(0)
    expect(filterStore.filters.maxVotes).toBeNull()
  })

  test.each<{
    mode: PinnedVideoMode
    expectedIds: string[]
  }>([
    {
      mode: 'keep-visible',
      expectedIds: ['pinned-match', 'pinned-miss', 'unpinned-match'],
    },
    { mode: 'match', expectedIds: ['pinned-match', 'unpinned-match'] },
    { mode: 'only', expectedIds: ['pinned-match'] },
    { mode: 'hide', expectedIds: ['unpinned-match'] },
  ])(
    'applies pinned mode $mode through domain filtering',
    ({ mode, expectedIds }) => {
      const { filterStore, videoStore } = mountStores()
      videoStore.addVideos([
        buildParsedVideo({
          id: 'pinned-miss',
          title: 'Bravo',
          tags: ['exclude'],
          pinned: true,
        }),
        buildParsedVideo({
          id: 'unpinned-match',
          title: 'Charlie',
          tags: ['include'],
        }),
        buildParsedVideo({
          id: 'unpinned-miss',
          title: 'Delta',
          tags: ['exclude'],
        }),
        buildParsedVideo({
          id: 'pinned-match',
          title: 'Alpha',
          tags: ['include'],
          pinned: true,
        }),
      ])

      filterStore.setSearchQuery('include')
      filterStore.setPinnedMode(mode)
      filterStore.setSortBy('title-asc')

      expect(ids(filterStore.filteredVideos)).toEqual(expectedIds)
    },
  )

  test.each<{
    availability: PreviewAvailability
    expectedIds: string[]
  }>([
    { availability: 'all', expectedIds: ['none', 'one', 'ready'] },
    { availability: 'ready', expectedIds: ['ready'] },
    { availability: 'missing', expectedIds: ['none', 'one'] },
  ])(
    'applies preview availability $availability through domain filtering',
    ({ availability, expectedIds }) => {
      const { filterStore, videoStore } = mountStores()
      videoStore.addVideos([
        buildParsedVideo({
          id: 'ready',
          title: 'Charlie',
          thumbUrls: ['a', 'b'],
        }),
        buildParsedVideo({ id: 'one', title: 'Bravo', thumbUrls: ['a'] }),
        buildParsedVideo({ id: 'none', title: 'Alpha', thumbUrls: [] }),
      ])

      filterStore.setPinnedMode('match')
      filterStore.setPreviewAvailability(availability)
      filterStore.setSortBy('title-asc')

      expect(ids(filterStore.filteredVideos)).toEqual(expectedIds)
    },
  )

  test.each<{
    sortBy: VideoSortOption
    expectedIds: string[]
  }>([
    {
      sortBy: 'votes-desc',
      expectedIds: ['same-a', 'same-b', 'beta', 'gamma'],
    },
    {
      sortBy: 'votes-asc',
      expectedIds: ['gamma', 'beta', 'same-a', 'same-b'],
    },
    {
      sortBy: 'duration-asc',
      expectedIds: ['beta', 'same-a', 'same-b', 'gamma'],
    },
    {
      sortBy: 'duration-desc',
      expectedIds: ['gamma', 'same-a', 'same-b', 'beta'],
    },
    {
      sortBy: 'title-asc',
      expectedIds: ['same-a', 'same-b', 'beta', 'gamma'],
    },
  ])(
    'applies sort $sortBy through domain filtering',
    ({ sortBy, expectedIds }) => {
      const { filterStore, videoStore } = mountStores()
      videoStore.addVideos([
        buildParsedVideo({
          id: 'gamma',
          title: 'Gamma',
          votes: 0,
          duration: 180,
        }),
        buildParsedVideo({
          id: 'same-b',
          title: 'Alpha',
          votes: 10,
          duration: 120,
        }),
        buildParsedVideo({
          id: 'beta',
          title: 'Beta',
          votes: 5,
          duration: 60,
        }),
        buildParsedVideo({
          id: 'same-a',
          title: 'alpha',
          votes: 10,
          duration: 120,
        }),
      ])

      filterStore.setPinnedMode('match')
      filterStore.setSortBy(sortBy)

      expect(ids(filterStore.filteredVideos)).toEqual(expectedIds)
    },
  )

  test('counts active criterion groups while excluding sort', () => {
    const { filterStore } = mountStores()

    expect(filterStore.activeFilterCount).toBe(0)

    filterStore.setSortBy('duration-desc')
    filterStore.setSearchQuery('   ')
    expect(filterStore.activeFilterCount).toBe(0)

    filterStore.setSearchQuery('demo')
    expect(filterStore.activeFilterCount).toBe(1)

    filterStore.setMinDurationMinutes(1)
    filterStore.setMaxDurationMinutes(5)
    expect(filterStore.activeFilterCount).toBe(2)

    filterStore.setMinVotes(-2)
    filterStore.setMaxVotes(8)
    expect(filterStore.activeFilterCount).toBe(3)

    filterStore.setPinnedMode('match')
    expect(filterStore.activeFilterCount).toBe(4)

    filterStore.setPreviewAvailability('ready')
    expect(filterStore.activeFilterCount).toBe(5)
  })

  test('clearFilters resets criteria and range errors while preserving sort', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({ id: 'range-source', duration: 15 * 60, votes: 12 }),
    ])

    filterStore.setSearchQuery('demo')
    filterStore.setMinDurationMinutes(10)
    filterStore.setMaxDurationMinutes(2)
    filterStore.setMinVotes(5)
    filterStore.setMaxVotes(0)
    filterStore.setPinnedMode('only')
    filterStore.setPreviewAvailability('ready')
    filterStore.setSortBy('title-asc')

    expect(filterStore.durationRangeError).toBe(
      'Minimum duration cannot exceed maximum duration.',
    )
    expect(filterStore.voteRangeError).toBe(
      'Minimum votes cannot exceed maximum votes.',
    )

    filterStore.clearFilters()

    expect(filterStore.filters).toEqual({
      searchQuery: '',
      minDurationMinutes: null,
      maxDurationMinutes: null,
      minVotes: null,
      maxVotes: null,
      pinnedMode: 'keep-visible',
      previewAvailability: 'all',
    })
    expect(filterStore.sortBy).toBe('title-asc')
    expect(filterStore.durationRangeMaximumMinutes).toBe(15)
    expect(filterStore.voteRangeMaximum).toBe(12)
    expect(filterStore.durationRangeError).toBeNull()
    expect(filterStore.voteRangeError).toBeNull()
  })

  test('reports total and visible video counts', () => {
    const { filterStore, videoStore } = mountStores()
    videoStore.addVideos([
      buildParsedVideo({ id: 'alpha', title: 'Alpha' }),
      buildParsedVideo({ id: 'beta', title: 'Beta' }),
      buildParsedVideo({ id: 'gamma', title: 'Gamma' }),
    ])

    filterStore.setPinnedMode('match')
    filterStore.setSearchQuery('beta')

    expect(filterStore.totalCount).toBe(3)
    expect(filterStore.visibleCount).toBe(1)
  })

  test('reports errors only for inverted committed ranges', () => {
    const { filterStore } = mountStores()

    expect(filterStore.durationRangeError).toBeNull()
    expect(filterStore.voteRangeError).toBeNull()

    filterStore.setMinDurationMinutes(5)
    filterStore.setMaxDurationMinutes(5)
    expect(filterStore.durationRangeError).toBeNull()

    filterStore.setMaxDurationMinutes(4)
    expect(filterStore.durationRangeError).toBe(
      'Minimum duration cannot exceed maximum duration.',
    )

    filterStore.setMaxDurationMinutes(null)
    expect(filterStore.durationRangeError).toBeNull()

    filterStore.setMinVotes(-1)
    filterStore.setMaxVotes(-1)
    expect(filterStore.voteRangeError).toBeNull()

    filterStore.setMaxVotes(-2)
    expect(filterStore.voteRangeError).toBe(
      'Minimum votes cannot exceed maximum votes.',
    )

    filterStore.setMinVotes(null)
    expect(filterStore.voteRangeError).toBeNull()
  })

  test('reacts to collection, pin, vote, and preview changes from the video store', async () => {
    const { filterStore, videoStore } = mountStores({
      useCases: {
        updateVotesUseCase: {
          execute: vi.fn(async () => 3),
        },
        updateThumbUseCase: {
          execute: vi.fn(async (video) => ({
            ...video,
            thumbUrls: Array.from(
              { length: 9 },
              (_, index) => `preview-${index}`,
            ),
          })),
        },
      },
    })

    videoStore.addVideos([
      buildParsedVideo({ id: 'reactive', votes: 1, thumbUrls: [] }),
      buildParsedVideo({ id: 'removed', votes: 100 }),
    ])
    expect(filterStore.totalCount).toBe(2)
    expect(filterStore.visibleCount).toBe(2)

    videoStore.removeVideo('removed')
    expect(filterStore.totalCount).toBe(1)
    expect(filterStore.visibleCount).toBe(1)

    filterStore.setPinnedMode('only')
    expect(filterStore.visibleCount).toBe(0)

    videoStore.togglePinVideo('reactive')
    expect(ids(filterStore.filteredVideos)).toEqual(['reactive'])

    filterStore.setMinVotes(2)
    expect(filterStore.visibleCount).toBe(0)

    await videoStore.updateVotes('reactive', 2)
    expect(ids(filterStore.filteredVideos)).toEqual(['reactive'])

    filterStore.setPreviewAvailability('ready')
    expect(filterStore.visibleCount).toBe(0)

    await videoStore.updateVideoThumbnails('reactive')
    expect(ids(filterStore.filteredVideos)).toEqual(['reactive'])
  })
})
