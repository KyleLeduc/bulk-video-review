import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type {
  IVideoCommand,
  IEventPublisher,
  VideoAddedEvent,
  VideoVotesUpdatedEvent,
} from '@app/ports'
import type { IVideoFacade } from '@domain/repositories'

export class VideoCommandAdapter implements IVideoCommand {
  constructor(
    private readonly facade: IVideoFacade,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity> {
    const result = await this.facade.postVideo(video)

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
    return this.facade.updateVideo(video)
  }

  async updateVotes(id: string, delta: number): Promise<number | null> {
    // Get current votes for event
    const currentVideo = await this.facade.getVideo(id)
    const oldVotes = currentVideo?.votes ?? 0

    const result = await this.facade.updateVotes(id, delta)
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
    return this.facade.wipeData()
  }
}
