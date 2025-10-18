import type { ParsedVideo } from '../entities'

interface Filters {
  minDuration?: number
  maxDuration?: number
  searchString?: string
  customFilters?: Array<(video: ParsedVideo) => boolean>
}

const applyDurationFilters = (
  videos: ParsedVideo[],
  { minDuration, maxDuration }: Filters,
): ParsedVideo[] => {
  let filteredVideos = videos

  if (minDuration !== undefined) {
    filteredVideos = filteredVideos.filter(
      (video) => video.duration >= minDuration,
    )
  }

  if (maxDuration !== undefined) {
    filteredVideos = filteredVideos.filter(
      (video) => video.duration <= maxDuration,
    )
  }

  return filteredVideos
}

const applySearchFilter = (
  videos: ParsedVideo[],
  searchString?: string,
): ParsedVideo[] => {
  if (!searchString) {
    return videos
  }

  const normalized = searchString.toLowerCase()
  return videos.filter((video) =>
    video.title.toLowerCase().includes(normalized),
  )
}

const applyCustomFilters = (
  videos: ParsedVideo[],
  customFilters?: Array<(video: ParsedVideo) => boolean>,
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
 * @param videos - The list of videos to filter
 * @param filters - The filters to apply
 * @returns The filtered list of videos
 */
export function applyFilters(
  videos: ParsedVideo[],
  filters: Filters,
): ParsedVideo[] {
  const pinnedVideos = videos.filter((video) => video.pinned)
  const unpinnedVideos = videos.filter((video) => !video.pinned)

  const filteredUnpinned = applyCustomFilters(
    applySearchFilter(
      applyDurationFilters(unpinnedVideos, filters),
      filters.searchString,
    ),
    filters.customFilters,
  )

  return [...pinnedVideos, ...filteredUnpinned]
}
