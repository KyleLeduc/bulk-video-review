import type { ParsedVideo } from '@domain/entities'
import { applyFilters } from '@domain/services'

interface FilterOptions {
  minDuration?: number
  maxDuration?: number
  searchString?: string
  customFilters?: Array<(video: ParsedVideo) => boolean>
}

export class FilterVideosUseCase {
  execute(videos: ParsedVideo[], filters: FilterOptions): ParsedVideo[] {
    return applyFilters(videos, filters)
  }
}
