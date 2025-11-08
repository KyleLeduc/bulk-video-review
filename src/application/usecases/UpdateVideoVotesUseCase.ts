import type { IVideoCommand } from '@app/ports/IVideoCommand'

export class UpdateVideoVotesUseCase {
  constructor(private readonly videoCommand: IVideoCommand) {}

  async execute(id: string, delta: number): Promise<number | null> {
    return this.videoCommand.updateVotes(id, delta)
  }
}

export interface UpdateVideoVotesUseCaseDeps {
  videoCommand: IVideoCommand
}

export function createUpdateVideoVotesUseCase({
  videoCommand,
}: UpdateVideoVotesUseCaseDeps): UpdateVideoVotesUseCase {
  return new UpdateVideoVotesUseCase(videoCommand)
}
