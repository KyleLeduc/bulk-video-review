import { describe, expect, test } from 'vitest'
import type { ParsedVideo } from '@domain/entities'
import type { VideoFilterOptions, VideoSortOption } from '@domain/valueObjects'
import { applyFilters } from './VideoFilterService'

const buildVideo = (overrides: Partial<ParsedVideo> = {}): ParsedVideo => ({
  id: 'video-1',
  title: 'Alpha walkthrough.mp4',
  thumb: '',
  duration: 120,
  thumbUrls: [],
  previewFrames: [],
  tags: [],
  votes: 0,
  url: '',
  pinned: false,
  ...overrides,
})

const ids = (videos: ParsedVideo[]) => videos.map(({ id }) => id)

describe('applyFilters', () => {
  test('recognizes persisted Blob previews and legacy URLs without treating a single cover as ready', () => {
    const frame = {
      timestampSeconds: 1,
      blob: new Blob(['frame']),
      width: 480,
      height: 270,
    }
    const videos = [
      buildVideo({
        id: 'blob-ready',
        previewFrames: [frame, { ...frame, timestampSeconds: 2 }],
      }),
      buildVideo({ id: 'legacy-ready', thumbUrls: ['one', 'two'] }),
      buildVideo({
        id: 'cover-only',
        previewFrames: [frame],
        thumbUrls: ['cover'],
      }),
      buildVideo({ id: 'missing' }),
    ]

    expect(
      ids(applyFilters({ videos, options: { previewAvailability: 'ready' } })),
    ).toEqual(['blob-ready', 'legacy-ready'])
    expect(
      ids(
        applyFilters({ videos, options: { previewAvailability: 'missing' } }),
      ),
    ).toEqual(['cover-only', 'missing'])
  })

  test('defaults to keep-visible and sorts each group by votes descending', () => {
    const videos = [
      buildVideo({
        id: 'pinned-low',
        title: 'Pinned Low',
        votes: 1,
        pinned: true,
      }),
      buildVideo({ id: 'unpinned-high', title: 'Unpinned High', votes: 10 }),
      buildVideo({
        id: 'pinned-high',
        title: 'Pinned High',
        votes: 5,
        pinned: true,
      }),
      buildVideo({ id: 'unpinned-low', title: 'Unpinned Low', votes: 2 }),
    ]

    expect(ids(applyFilters({ videos, options: {} }))).toEqual([
      'pinned-high',
      'pinned-low',
      'unpinned-high',
      'unpinned-low',
    ])
  })

  test('trims search and matches titles or tags without case sensitivity', () => {
    const titleMatch = buildVideo({
      id: 'title-match',
      title: 'Product DEMO.mp4',
    })
    const tagMatch = buildVideo({
      id: 'tag-match',
      title: 'Walkthrough.mp4',
      tags: ['Demo Day'],
    })
    const miss = buildVideo({
      id: 'miss',
      title: 'Walkthrough.mp4',
      tags: ['tutorial'],
    })

    const result = applyFilters({
      videos: [miss, tagMatch, titleMatch],
      options: { searchQuery: '  demo  ', pinnedMode: 'match' },
      sortBy: 'title-asc',
    })

    expect(ids(result)).toEqual(['title-match', 'tag-match'])
  })

  test('uses inclusive duration and vote bounds', () => {
    const atMinimum = buildVideo({
      id: 'at-minimum',
      duration: 60,
      votes: 2,
    })
    const atMaximum = buildVideo({
      id: 'at-maximum',
      duration: 180,
      votes: 8,
    })
    const belowDuration = buildVideo({
      id: 'below-duration',
      duration: 59,
      votes: 2,
    })
    const aboveDuration = buildVideo({
      id: 'above-duration',
      duration: 181,
      votes: 8,
    })
    const belowVotes = buildVideo({
      id: 'below-votes',
      duration: 120,
      votes: 1,
    })
    const aboveVotes = buildVideo({
      id: 'above-votes',
      duration: 120,
      votes: 9,
    })

    const result = applyFilters({
      videos: [
        aboveVotes,
        belowVotes,
        aboveDuration,
        atMaximum,
        belowDuration,
        atMinimum,
      ],
      options: {
        minDurationSeconds: 60,
        maxDurationSeconds: 180,
        minVotes: 2,
        maxVotes: 8,
        pinnedMode: 'match',
      },
      sortBy: 'duration-asc',
    })

    expect(ids(result)).toEqual(['at-minimum', 'at-maximum'])
  })

  test('combines search, duration, vote, and preview criteria with AND', () => {
    const matching = buildVideo({
      id: 'matching',
      title: 'Demo.mp4',
      duration: 120,
      votes: 4,
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const wrongSearch = buildVideo({
      id: 'wrong-search',
      title: 'Other.mp4',
      duration: 120,
      votes: 4,
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const wrongDuration = buildVideo({
      id: 'wrong-duration',
      title: 'Demo.mp4',
      duration: 30,
      votes: 4,
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const wrongScore = buildVideo({
      id: 'wrong-score',
      title: 'Demo.mp4',
      duration: 120,
      votes: 0,
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const missingPreviews = buildVideo({
      id: 'missing-previews',
      title: 'Demo.mp4',
      duration: 120,
      votes: 4,
      thumbUrls: ['thumb-1'],
    })

    const result = applyFilters({
      videos: [
        missingPreviews,
        wrongScore,
        wrongDuration,
        wrongSearch,
        matching,
      ],
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

    expect(ids(result)).toEqual(['matching'])
  })

  test('treats more than one thumbnail as ready and all others as missing', () => {
    const noPreviews = buildVideo({ id: 'none', thumbUrls: [] })
    const onePreview = buildVideo({ id: 'one', thumbUrls: ['thumb-1'] })
    const twoPreviews = buildVideo({
      id: 'two',
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const videos = [noPreviews, onePreview, twoPreviews]

    const ready = applyFilters({
      videos,
      options: { previewAvailability: 'ready', pinnedMode: 'match' },
    })
    const missing = applyFilters({
      videos,
      options: { previewAvailability: 'missing', pinnedMode: 'match' },
    })
    const all = applyFilters({
      videos,
      options: { previewAvailability: 'all', pinnedMode: 'match' },
    })

    expect(ids(ready)).toEqual(['two'])
    expect(ids(missing)).toEqual(['none', 'one'])
    expect(ids(all)).toEqual(['none', 'one', 'two'])
  })

  test('keeps every pinned video in a sorted leading group', () => {
    const pinnedZulu = buildVideo({
      id: 'pinned-zulu',
      title: 'Zulu',
      tags: ['miss'],
      pinned: true,
    })
    const pinnedAlpha = buildVideo({
      id: 'pinned-alpha',
      title: 'Alpha',
      tags: ['miss'],
      pinned: true,
    })
    const matchingUnpinned = buildVideo({
      id: 'matching-unpinned',
      title: 'Bravo',
      tags: ['include'],
    })
    const missingUnpinned = buildVideo({
      id: 'missing-unpinned',
      title: 'Able',
      tags: ['miss'],
    })

    const result = applyFilters({
      videos: [pinnedZulu, matchingUnpinned, missingUnpinned, pinnedAlpha],
      options: { searchQuery: 'include', pinnedMode: 'keep-visible' },
      sortBy: 'title-asc',
    })

    expect(ids(result)).toEqual([
      'pinned-alpha',
      'pinned-zulu',
      'matching-unpinned',
    ])
  })

  test('match gives pinned status no visibility effect', () => {
    const pinnedMatch = buildVideo({
      id: 'pinned-match',
      tags: ['include'],
      pinned: true,
    })
    const unpinnedMatch = buildVideo({
      id: 'unpinned-match',
      tags: ['include'],
    })
    const pinnedMiss = buildVideo({
      id: 'pinned-miss',
      tags: ['miss'],
      pinned: true,
    })

    const result = applyFilters({
      videos: [pinnedMiss, unpinnedMatch, pinnedMatch],
      options: { searchQuery: 'include', pinnedMode: 'match' },
      sortBy: 'title-asc',
    })

    expect(ids(result)).toEqual(['pinned-match', 'unpinned-match'])
  })

  test('only requires pinned videos to match every other criterion', () => {
    const pinnedMatch = buildVideo({
      id: 'pinned-match',
      tags: ['include'],
      pinned: true,
    })
    const pinnedMiss = buildVideo({
      id: 'pinned-miss',
      tags: ['miss'],
      pinned: true,
    })
    const unpinnedMatch = buildVideo({
      id: 'unpinned-match',
      tags: ['include'],
    })

    const result = applyFilters({
      videos: [unpinnedMatch, pinnedMiss, pinnedMatch],
      options: { searchQuery: 'include', pinnedMode: 'only' },
    })

    expect(ids(result)).toEqual(['pinned-match'])
  })

  test('hide requires unpinned videos to match every other criterion', () => {
    const pinnedMatch = buildVideo({
      id: 'pinned-match',
      tags: ['include'],
      pinned: true,
    })
    const unpinnedMatch = buildVideo({
      id: 'unpinned-match',
      tags: ['include'],
    })
    const unpinnedMiss = buildVideo({
      id: 'unpinned-miss',
      tags: ['miss'],
    })

    const result = applyFilters({
      videos: [unpinnedMiss, unpinnedMatch, pinnedMatch],
      options: { searchQuery: 'include', pinnedMode: 'hide' },
    })

    expect(ids(result)).toEqual(['unpinned-match'])
  })

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
    'sorts by $sortBy with title then ID tie-breakers',
    ({ sortBy, expectedIds }) => {
      const videos = [
        buildVideo({
          id: 'gamma',
          title: 'Gamma',
          votes: 0,
          duration: 180,
        }),
        buildVideo({
          id: 'same-b',
          title: 'Alpha',
          votes: 10,
          duration: 120,
        }),
        buildVideo({
          id: 'beta',
          title: 'Beta',
          votes: 5,
          duration: 60,
        }),
        buildVideo({
          id: 'same-a',
          title: 'alpha',
          votes: 10,
          duration: 120,
        }),
      ]

      const result = applyFilters({
        videos,
        options: { pinnedMode: 'match' },
        sortBy,
      })

      expect(ids(result)).toEqual(expectedIds)
    },
  )

  test.each<{
    name: string
    options: VideoFilterOptions
  }>([
    {
      name: 'duration',
      options: { minDurationSeconds: 121, maxDurationSeconds: 120 },
    },
    {
      name: 'vote',
      options: { minVotes: 2, maxVotes: 1 },
    },
  ])('returns no videos for an inverted $name range', ({ options }) => {
    const videos = [buildVideo({ id: 'pinned', pinned: true })]

    expect(applyFilters({ videos, options })).toEqual([])
  })

  test('does not mutate the input array or its videos while sorting', () => {
    const first = buildVideo({
      id: 'first',
      title: 'Zulu',
      votes: 1,
      tags: ['original-tag'],
      thumbUrls: ['thumb-1'],
    })
    const second = buildVideo({
      id: 'second',
      title: 'Alpha',
      votes: 2,
      tags: ['another-tag'],
      thumbUrls: ['thumb-1', 'thumb-2'],
    })
    const videos = [first, second]
    const snapshot = videos.map((video) => ({
      ...video,
      tags: [...video.tags],
      thumbUrls: [...video.thumbUrls],
    }))

    const result = applyFilters({ videos, options: {}, sortBy: 'votes-desc' })

    expect(ids(result)).toEqual(['second', 'first'])
    expect(result).not.toBe(videos)
    expect(videos).toEqual(snapshot)
    expect(videos[0]).toBe(first)
    expect(videos[1]).toBe(second)
  })
})
