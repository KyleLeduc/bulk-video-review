import type { IVideoFacade } from '@/domain/repositories'

export class WipeVideoDataUseCase {
  constructor(private readonly facade: IVideoFacade) {}

  async execute(): Promise<void> {
    await this.facade.wipeData()
  }
}
