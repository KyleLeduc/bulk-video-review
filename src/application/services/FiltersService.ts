import type { ParsedVideo } from '@/domain'

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

/**
 * Applies the filters specified in the config to the provided array
 *
 * @param videos Array of parsed video meta data
 * @param filters The filters to apply
 * @returns a filtered array of parsed videos
 */
export function applyFilters(
  videos: ParsedVideo[],
  filters: Filters,
): ParsedVideo[] {
  const pinnedVideos = videos.filter((v) => v.pinned)
  let unPinnedVideos = videos.filter((v) => !v.pinned)

  if (filters.minDuration) {
    unPinnedVideos = minDurationFilter(unPinnedVideos, filters.minDuration)
  }
  if (filters.maxDuration) {
    unPinnedVideos = maxDurationFilter(unPinnedVideos, filters.maxDuration)
  }
  if (filters.searchString) {
    unPinnedVideos = titleContainsFilter(unPinnedVideos, filters.searchString)
  }

  if (filters.customFilters) {
    filters.customFilters.forEach((filterFn) => {
      unPinnedVideos = unPinnedVideos.filter(filterFn)
    })
  }

  return [...pinnedVideos, ...unPinnedVideos]
}
