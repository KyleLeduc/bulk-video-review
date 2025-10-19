import { applyFilters } from '@domain/services'
import type { VideoFilterRequest } from '@domain/valueObjects'

export class FilterVideosUseCase {
  execute(request: VideoFilterRequest): ReturnType<typeof applyFilters> {
    return applyFilters(request)
  }
}
