import type { ParsedVideo } from '../entities'
import type {
  VideoFilterOptions,
  VideoFilterRequest,
  VideoSortOption,
} from '@domain/valueObjects'

const hasInvertedRange = ({
  minDurationSeconds,
  maxDurationSeconds,
  minVotes,
  maxVotes,
}: VideoFilterOptions): boolean =>
  (minDurationSeconds !== undefined &&
    maxDurationSeconds !== undefined &&
    minDurationSeconds > maxDurationSeconds) ||
  (minVotes !== undefined && maxVotes !== undefined && minVotes > maxVotes)

const matchesCriteria = (
  video: ParsedVideo,
  options: VideoFilterOptions,
): boolean => {
  const normalizedSearch = options.searchQuery?.trim().toLowerCase()
  const matchesSearch =
    !normalizedSearch ||
    video.title.toLowerCase().includes(normalizedSearch) ||
    video.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))

  if (!matchesSearch) {
    return false
  }

  if (
    options.minDurationSeconds !== undefined &&
    video.duration < options.minDurationSeconds
  ) {
    return false
  }

  if (
    options.maxDurationSeconds !== undefined &&
    video.duration > options.maxDurationSeconds
  ) {
    return false
  }

  if (options.minVotes !== undefined && video.votes < options.minVotes) {
    return false
  }

  if (options.maxVotes !== undefined && video.votes > options.maxVotes) {
    return false
  }

  const previewAvailability = options.previewAvailability ?? 'all'

  switch (previewAvailability) {
    case 'all':
      return true
    case 'ready':
      return video.previewFrames.length > 1 || video.thumbUrls.length > 1
    case 'missing':
      return video.previewFrames.length <= 1 && video.thumbUrls.length <= 1
    default: {
      const unsupportedPreviewAvailability: never = previewAvailability
      throw new Error(
        `Unsupported preview availability: ${unsupportedPreviewAvailability}`,
      )
    }
  }
}

const byTitleThenId = (a: ParsedVideo, b: ParsedVideo): number =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
  a.id.localeCompare(b.id)

const sortVideos = (
  videos: ParsedVideo[],
  sortBy: VideoSortOption,
): ParsedVideo[] =>
  [...videos].sort((a, b) => {
    let result: number

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
      default: {
        const unsupportedSort: never = sortBy
        throw new Error(`Unsupported video sort option: ${unsupportedSort}`)
      }
    }

    return result || byTitleThenId(a, b)
  })

/**
 * Apply multiple filters to a list of videos
 * @param request - Videos and filters to apply
 * @returns The filtered list of videos
 */
export function applyFilters(request: VideoFilterRequest): ParsedVideo[] {
  const { videos, options, sortBy = 'votes-desc' } = request

  if (hasInvertedRange(options)) {
    return []
  }

  const pinnedMode = options.pinnedMode ?? 'keep-visible'

  if (pinnedMode === 'keep-visible') {
    const protectedPinned = videos.filter((video) => video.pinned)
    const matchingUnpinned = videos.filter(
      (video) => !video.pinned && matchesCriteria(video, options),
    )

    return [
      ...sortVideos(protectedPinned, sortBy),
      ...sortVideos(matchingUnpinned, sortBy),
    ]
  }

  let candidates: ParsedVideo[]

  switch (pinnedMode) {
    case 'match':
      candidates = videos
      break
    case 'only':
      candidates = videos.filter((video) => video.pinned)
      break
    case 'hide':
      candidates = videos.filter((video) => !video.pinned)
      break
  }

  return sortVideos(
    candidates.filter((video) => matchesCriteria(video, options)),
    sortBy,
  )
}
