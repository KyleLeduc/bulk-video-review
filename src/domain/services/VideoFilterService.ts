import type { ParsedVideo } from '../entities'
import type {
  VideoFilterOptions,
  VideoFilterRequest,
} from '@domain/valueObjects'

const applyDurationFilters = (
  videos: ParsedVideo[],
  { minDurationSeconds, maxDurationSeconds }: VideoFilterOptions,
): ParsedVideo[] => {
  let filteredVideos = videos

  if (minDurationSeconds !== undefined) {
    filteredVideos = filteredVideos.filter(
      (video) => video.duration >= minDurationSeconds,
    )
  }

  if (maxDurationSeconds !== undefined) {
    filteredVideos = filteredVideos.filter(
      (video) => video.duration <= maxDurationSeconds,
    )
  }

  return filteredVideos
}

const applySearchFilter = (
  videos: ParsedVideo[],
  searchQuery?: string,
): ParsedVideo[] => {
  if (!searchQuery) {
    return videos
  }

  const normalized = searchQuery.toLowerCase()
  return videos.filter((video) =>
    video.title.toLowerCase().includes(normalized),
  )
}

const applyCustomFilters = (
  videos: ParsedVideo[],
  customFilters?: VideoFilterOptions['customFilters'],
): ParsedVideo[] => {
  if (!customFilters || customFilters.length === 0) {
    return videos
  }

  return videos.filter((video) =>
    customFilters.every((filter) => filter(video)),
  )
}

/**
 * Apply multiple filters to a list of videos
 * @param request - Videos and filters to apply
 * @returns The filtered list of videos
 */
export function applyFilters(request: VideoFilterRequest): ParsedVideo[] {
  const { videos, options } = request
  const pinnedVideos = videos.filter((video) => video.pinned)
  const unpinnedVideos = videos.filter((video) => !video.pinned)

  const filteredUnpinned = applyCustomFilters(
    applySearchFilter(
      applyDurationFilters(unpinnedVideos, options),
      options.searchQuery,
    ),
    options.customFilters,
  )

  return [...pinnedVideos, ...filteredUnpinned]
}
