import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type {
  IVideoCommand,
  IEventPublisher,
  VideoAddedEvent,
  VideoVotesUpdatedEvent,
} from '@app/ports'
import type { IVideoAggregateRepository } from '@domain/repositories'

export class VideoCommandAdapter implements IVideoCommand {
  constructor(
    private readonly repository: IVideoAggregateRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity> {
    const result = await this.repository.postVideo(video)

    // Publish domain event
    const event: VideoAddedEvent = {
      eventType: 'VideoAdded',
      aggregateId: result.id,
      timestamp: new Date(),
      data: {
        videoId: result.id,
        title: result.title,
        duration: result.duration,
      },
    }

    await this.eventPublisher.publish(event)

    return result
  }

  async updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    return this.repository.updateVideo(video)
  }

  async updateVotes(id: string, delta: number): Promise<number | null> {
    // Get current votes for event
    const currentVideo = await this.repository.getVideo(id)
    const oldVotes = currentVideo?.votes ?? 0

    const result = await this.repository.updateVotes(id, delta)
    const newVotes = result ? result.votes : null

    if (newVotes !== null) {
      // Publish domain event
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

  async wipeData(): Promise<void> {
    return this.repository.wipeData()
  }
}
