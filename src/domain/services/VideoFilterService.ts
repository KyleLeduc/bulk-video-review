import type { ParsedVideo } from '../entities'

interface Filters {
  minDuration?: number
  maxDuration?: number
  searchString?: string
  customFilters?: Array<(video: ParsedVideo) => boolean>
}

// Filter by minimum duration
function minDurationFilter(
  videos: ParsedVideo[],
  minDuration: number,
): ParsedVideo[] {
  return videos.filter((video) => video.duration >= minDuration)
}

// Filter by maximum duration
function maxDurationFilter(
  videos: ParsedVideo[],
  maxDuration: number,
): ParsedVideo[] {
  return videos.filter((video) => video.duration <= maxDuration)
}

// Filter by title containing a string
function titleContainsFilter(
  videos: ParsedVideo[],
  searchString: string,
): ParsedVideo[] {
  return videos.filter((video) =>
    video.title.toLowerCase().includes(searchString.toLowerCase()),
  )
}

// Apply custom filters
function customFiltersFilter(
  videos: ParsedVideo[],
  customFilters: Array<(video: ParsedVideo) => boolean>,
): ParsedVideo[] {
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
  let filteredVideos = videos

  if (filters.minDuration !== undefined) {
    filteredVideos = minDurationFilter(filteredVideos, filters.minDuration)
  }

  if (filters.maxDuration !== undefined) {
    filteredVideos = maxDurationFilter(filteredVideos, filters.maxDuration)
  }

  if (filters.searchString) {
    filteredVideos = titleContainsFilter(filteredVideos, filters.searchString)
  }

  if (filters.customFilters && filters.customFilters.length > 0) {
    filteredVideos = customFiltersFilter(filteredVideos, filters.customFilters)
  }

  return filteredVideos
}
