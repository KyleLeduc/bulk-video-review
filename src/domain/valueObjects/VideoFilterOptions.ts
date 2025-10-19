import type { ParsedVideo } from '@domain/entities'

export type VideoCustomFilter = (video: ParsedVideo) => boolean

export interface VideoFilterOptions {
  minDurationSeconds?: number
  maxDurationSeconds?: number
  searchQuery?: string
  customFilters?: VideoCustomFilter[]
}

export interface VideoFilterRequest {
  videos: ParsedVideo[]
  options: VideoFilterOptions
}
