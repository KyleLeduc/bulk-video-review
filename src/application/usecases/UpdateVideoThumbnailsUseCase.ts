import type { ParsedVideo } from '@domain/entities'
import type {
  IVideoThumbnailGenerator,
  IEventPublisher,
  IVideoSessionRegistry,
  VideoThumbnailUpdatedEvent,
} from '@app/ports'
import type { IVideoAggregateRepository } from '@domain/repositories'

export class UpdateVideoThumbnailsUseCase {
  constructor(
    private readonly thumbnailGenerator: IVideoThumbnailGenerator,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(video: ParsedVideo): Promise<ParsedVideo> {
    if (video.thumbUrls.length > 1) {
      return video
    }

    const sourceUrl =
      video.url || this.sessionRegistry.acquireObjectUrl(video.id)
    if (!sourceUrl) {
      return video
    }

    const acquiredFromRegistry = sourceUrl !== video.url
    let thumbs: string[] = []

    try {
      thumbs = await this.thumbnailGenerator.generateThumbnails(sourceUrl)
    } finally {
      if (acquiredFromRegistry) {
        this.sessionRegistry.releaseObjectUrl(video.id)
      }
    }

    const { url, pinned, ...aggregate } = video
    const dto = await this.aggregateRepository.updateVideo({
      ...aggregate,
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
      url,
      pinned,
    }
  }
}

export interface UpdateVideoThumbnailsUseCaseDeps {
  thumbnailGenerator: IVideoThumbnailGenerator
  aggregateRepository: IVideoAggregateRepository
  sessionRegistry: IVideoSessionRegistry
  eventPublisher: IEventPublisher
}

export function createUpdateVideoThumbnailsUseCase({
  thumbnailGenerator,
  aggregateRepository,
  sessionRegistry,
  eventPublisher,
}: UpdateVideoThumbnailsUseCaseDeps): UpdateVideoThumbnailsUseCase {
  return new UpdateVideoThumbnailsUseCase(
    thumbnailGenerator,
    aggregateRepository,
    sessionRegistry,
    eventPublisher,
  )
}
