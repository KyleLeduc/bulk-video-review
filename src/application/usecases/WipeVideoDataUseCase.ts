import type { IVideoAggregateRepository } from '@domain/repositories'

export class WipeVideoDataUseCase {
  constructor(private readonly repository: IVideoAggregateRepository) {}

  async execute(): Promise<void> {
    await this.repository.wipeData()
  }
}

export interface WipeVideoDataUseCaseDeps {
  repository: IVideoAggregateRepository
}

export function createWipeVideoDataUseCase({
  repository,
}: WipeVideoDataUseCaseDeps): WipeVideoDataUseCase {
  return new WipeVideoDataUseCase(repository)
}
