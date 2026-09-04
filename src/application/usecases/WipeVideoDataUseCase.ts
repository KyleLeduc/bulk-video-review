import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'

export class WipeVideoDataUseCase {
  constructor(
    private readonly repository: IVideoAggregateRepository,
    private readonly previewRepository: IVideoPreviewRepository,
  ) {}

  async execute(): Promise<void> {
    await Promise.all([
      this.repository.wipeData(),
      this.previewRepository.clear(),
    ])
  }
}

export interface WipeVideoDataUseCaseDeps {
  repository: IVideoAggregateRepository
  previewRepository: IVideoPreviewRepository
}

export function createWipeVideoDataUseCase({
  repository,
  previewRepository,
}: WipeVideoDataUseCaseDeps): WipeVideoDataUseCase {
  return new WipeVideoDataUseCase(repository, previewRepository)
}
