import type { ParsedVideo } from '@domain/entities'

export type PinnedVideoMode = 'keep-visible' | 'match' | 'only' | 'hide'
export type PreviewAvailability = 'all' | 'ready' | 'missing'
export type VideoSortOption =
  | 'votes-desc'
  | 'votes-asc'
  | 'duration-asc'
  | 'duration-desc'
  | 'title-asc'

export interface VideoFilterOptions {
  minDurationSeconds?: number
  maxDurationSeconds?: number
  minVotes?: number
  maxVotes?: number
  searchQuery?: string
  pinnedMode?: PinnedVideoMode
  previewAvailability?: PreviewAvailability
}

export interface VideoFilterRequest {
  videos: ParsedVideo[]
  options: VideoFilterOptions
  sortBy?: VideoSortOption
}
