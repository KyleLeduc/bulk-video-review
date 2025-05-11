import type { IVideoStorage } from '@app/ports/IVideoStorage'

export class UpdateVideoVotesUseCase {
  constructor(private readonly videoStorage: IVideoStorage) {}

  async execute(id: string, delta: number): Promise<number | null> {
    return this.videoStorage.updateVotes(id, delta)
  }
}
