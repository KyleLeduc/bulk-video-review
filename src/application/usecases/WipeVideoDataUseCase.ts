import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import type { IVideoPreviewCacheRepository } from '@domain/repositories/IVideoPreviewCacheRepository'

export class WipeVideoDataUseCase {
  constructor(
    private readonly repository: IVideoAggregateRepository,
    private readonly previewRepository: IVideoPreviewRepository,
    private readonly previewCache?: IVideoPreviewCacheRepository,
  ) {}

  async execute(): Promise<void> {
    const results = await Promise.allSettled([
      this.previewCache?.clear(),
      this.repository.wipeData(),
      this.previewRepository.clear(),
    ])
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
}

export interface WipeVideoDataUseCaseDeps {
  repository: IVideoAggregateRepository
  previewRepository: IVideoPreviewRepository
  previewCache?: IVideoPreviewCacheRepository
}

export function createWipeVideoDataUseCase({
  repository,
  previewRepository,
  previewCache,
}: WipeVideoDataUseCaseDeps): WipeVideoDataUseCase {
  return new WipeVideoDataUseCase(repository, previewRepository, previewCache)
}
