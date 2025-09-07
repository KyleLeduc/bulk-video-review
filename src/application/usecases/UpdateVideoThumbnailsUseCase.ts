import type { ParsedVideo } from '@domain/entities'
import type {
  IVideoThumbnailGenerator,
  IVideoCommand,
  IEventPublisher,
  VideoThumbnailUpdatedEvent,
} from '@app/ports'

export class UpdateVideoThumbnailsUseCase {
  constructor(
    private readonly thumbnailGenerator: IVideoThumbnailGenerator,
    private readonly videoCommand: IVideoCommand,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(video: ParsedVideo): Promise<ParsedVideo> {
    if (video.thumbUrls.length > 1) {
      return video
    }

    const thumbs = await this.thumbnailGenerator.generateThumbnails(video.url)

    const dto = await this.videoCommand.updateVideo({
      ...video,
      thumbUrls: thumbs,
    })

    if (!dto) {
      return video
    }

    // Publish domain event
    const event: VideoThumbnailUpdatedEvent = {
      eventType: 'VideoThumbnailUpdated',
      aggregateId: video.id,
      timestamp: new Date(),
      data: {
        videoId: video.id,
        thumbnailCount: thumbs.length,
      },
    }

    await this.eventPublisher.publish(event)

    return {
      ...dto,
      url: video.url,
      pinned: video.pinned,
    }
  }
}
