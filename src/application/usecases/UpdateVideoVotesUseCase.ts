import type {
  IEventPublisher,
  VideoVotesUpdatedEvent,
} from '@app/ports'
import type { IVideoAggregateRepository } from '@domain/repositories'

export class UpdateVideoVotesUseCase {
  constructor(
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(id: string, delta: number): Promise<number | null> {
    const currentVideo = await this.aggregateRepository.getVideo(id)
    const oldVotes = currentVideo?.votes ?? 0

    const result = await this.aggregateRepository.updateVotes(id, delta)
    const newVotes = result?.votes ?? null

    if (newVotes !== null) {
      const event: VideoVotesUpdatedEvent = {
        eventType: 'VideoVotesUpdated',
        aggregateId: id,
        timestamp: new Date(),
        data: {
          videoId: id,
          oldVotes,
          newVotes,
          delta,
        },
      }

      await this.eventPublisher.publish(event)
    }

    return newVotes
  }
}

export interface UpdateVideoVotesUseCaseDeps {
  aggregateRepository: IVideoAggregateRepository
  eventPublisher: IEventPublisher
}

export function createUpdateVideoVotesUseCase({
  aggregateRepository,
  eventPublisher,
}: UpdateVideoVotesUseCaseDeps): UpdateVideoVotesUseCase {
  return new UpdateVideoVotesUseCase(aggregateRepository, eventPublisher)
}
