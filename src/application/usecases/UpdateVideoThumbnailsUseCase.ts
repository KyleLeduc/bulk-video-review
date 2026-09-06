import type { ParsedVideo } from '@domain/entities'
import { measureVideoProcessing } from '@app/services/videoProcessingTiming'
import {
  hasCompletePreviews,
  previewFrameTarget,
} from '@app/services/previewCompleteness'
import type {
  IVideoThumbnailGenerator,
  IEventPublisher,
  IVideoSessionRegistry,
  VideoPreviewGenerationOptions,
  VideoThumbnailUpdatedEvent,
} from '@app/ports'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'

export class UpdateVideoThumbnailsUseCase {
  constructor(
    private readonly thumbnailGenerator: IVideoThumbnailGenerator,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly eventPublisher: IEventPublisher,
    private readonly previewRepository: IVideoPreviewRepository,
  ) {}

  async execute(
    video: ParsedVideo,
    options?: VideoPreviewGenerationOptions,
  ): Promise<ParsedVideo> {
    options?.signal?.throwIfAborted()
    const expectedFrames = previewFrameTarget(options?.count)
    if (hasCompletePreviews(video, expectedFrames)) {
      return video
    }

    const sourceUrl =
      video.url || this.sessionRegistry.acquireObjectUrl(video.id)
    if (!sourceUrl) {
      return video
    }

    const acquiredFromRegistry = sourceUrl !== video.url
    let previewFrames = []

    try {
      previewFrames = await this.thumbnailGenerator.generateThumbnails(
        sourceUrl,
        options,
      )
    } finally {
      if (acquiredFromRegistry) {
        this.sessionRegistry.releaseObjectUrl(video.id)
      }
    }

    options?.signal?.throwIfAborted()
    if (expectedFrames <= 0 || previewFrames.length !== expectedFrames) {
      return video
    }

    const currentAggregate = await measureVideoProcessing(
      'persistence',
      () => this.aggregateRepository.getVideo(video.id),
      options?.onTiming,
    )
    options?.signal?.throwIfAborted()
    if (!currentAggregate) {
      return video
    }

    options?.onProgress?.({
      stage: 'persisting',
      completedFrames: previewFrames.length,
      totalFrames: expectedFrames,
    })

    options?.signal?.throwIfAborted()
    await measureVideoProcessing(
      'persistence',
      () => this.previewRepository.replaceFrames(video.id, previewFrames),
      options?.onTiming,
    )
    // A committed frame set is safe to retain after cancellation, but must not
    // clear legacy data or publish completion for a cancelled job.
    options?.signal?.throwIfAborted()

    const { url, pinned } = video
    const dto = await measureVideoProcessing(
      'persistence',
      () =>
        this.aggregateRepository.updateVideo({
          ...currentAggregate,
          thumbUrls: [],
        }),
      options?.onTiming,
    )

    options?.signal?.throwIfAborted()
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
        thumbnailCount: previewFrames.length,
      },
    }

    await this.eventPublisher.publish(event)

    return {
      ...dto,
      url,
      pinned,
      previewFrames,
      motionClips: video.motionClips,
      keyframes: video.keyframes,
      previewVersions: video.previewVersions,
    }
  }
}

export interface UpdateVideoThumbnailsUseCaseDeps {
  thumbnailGenerator: IVideoThumbnailGenerator
  aggregateRepository: IVideoAggregateRepository
  sessionRegistry: IVideoSessionRegistry
  eventPublisher: IEventPublisher
  previewRepository: IVideoPreviewRepository
}

export function createUpdateVideoThumbnailsUseCase({
  thumbnailGenerator,
  aggregateRepository,
  sessionRegistry,
  eventPublisher,
  previewRepository,
}: UpdateVideoThumbnailsUseCaseDeps): UpdateVideoThumbnailsUseCase {
  return new UpdateVideoThumbnailsUseCase(
    thumbnailGenerator,
    aggregateRepository,
    sessionRegistry,
    eventPublisher,
    previewRepository,
  )
}
