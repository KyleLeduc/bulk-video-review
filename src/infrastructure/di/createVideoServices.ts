import type { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
  VideoPreviewRepository,
  VideoPreviewCacheRepository,
  VideoRepository,
} from '@infra/repository'
import {
  BrowserVideoFileParser,
  VideoIngestionFailureTracker,
  VideoSessionRegistry,
} from '@infra/video'
import {
  ConsoleLoggerAdapter,
  NoOpEventPublisher,
  VideoMetadataExtractorAdapter,
  VideoQueryAdapter,
  VideoThumbnailGeneratorAdapter,
  MediabunnyVideoPreviewGenerator,
} from '@infra/adapters'
import {
  createLinearVideoIngestionUseCase,
  createFilterVideosUseCase,
  createUpdateVideoThumbnailsUseCase,
  createUpdateVideoVotesUseCase,
  createWipeVideoDataUseCase,
  UpdateVideoPreviewsUseCase,
} from '@app/usecases'

export function createVideoServices({
  databaseConnection,
  previewMode = 'motion',
}: {
  databaseConnection: DatabaseConnection
  previewMode?: 'motion' | 'legacy-stills'
}) {
  // Infrastructure dependencies
  const metadataRepository = new MetadataRepository(databaseConnection)
  const videoRepository = new VideoRepository(databaseConnection)
  const videoPreviewRepository = new VideoPreviewRepository(databaseConnection)
  const videoIngestionFailureTracker = new VideoIngestionFailureTracker(
    databaseConnection,
  )
  // Cross-cutting concern adapters
  const logger = new ConsoleLoggerAdapter()
  // Versioned pipeline benchmarks explicitly retain the old cache and workload.
  const previewCache =
    previewMode === 'motion'
      ? new VideoPreviewCacheRepository(logger)
      : undefined
  const eventPublisher = new NoOpEventPublisher()

  const videoSessionRegistry = new VideoSessionRegistry(logger)

  const videoAggregateRepository = new VideoAggregateRepository(
    metadataRepository,
    videoRepository,
    logger,
  )

  // Infrastructure services
  const browserVideoFileParser = new BrowserVideoFileParser()
  const videoMetadataExtractorAdapter = new VideoMetadataExtractorAdapter(
    browserVideoFileParser,
    logger,
  )
  // Adapters
  const videoQueryAdapter = new VideoQueryAdapter(videoAggregateRepository)
  const videoThumbnailGeneratorAdapter = new VideoThumbnailGeneratorAdapter()

  // Use cases
  const addVideosUseCase = createLinearVideoIngestionUseCase({
    metadataExtractor: videoMetadataExtractorAdapter,
    aggregateRepository: videoAggregateRepository,
    sessionRegistry: videoSessionRegistry,
    logger,
    failureTracker: videoIngestionFailureTracker,
    previewRepository: videoPreviewRepository,
    previewCache,
  })

  const updateThumbUseCase =
    previewMode === 'legacy-stills'
      ? createUpdateVideoThumbnailsUseCase({
          thumbnailGenerator: videoThumbnailGeneratorAdapter,
          aggregateRepository: videoAggregateRepository,
          sessionRegistry: videoSessionRegistry,
          eventPublisher,
          previewRepository: videoPreviewRepository,
        })
      : null
  const updatePreviewsUseCase = previewCache
    ? new UpdateVideoPreviewsUseCase(
        new MediabunnyVideoPreviewGenerator(),
        videoAggregateRepository,
        videoSessionRegistry,
        previewCache,
        logger,
        videoThumbnailGeneratorAdapter,
      )
    : null

  const updateVotesUseCase = createUpdateVideoVotesUseCase({
    aggregateRepository: videoAggregateRepository,
    eventPublisher,
  })

  const wipeVideoDataUseCase = createWipeVideoDataUseCase({
    repository: videoAggregateRepository,
    previewRepository: videoPreviewRepository,
    previewCache,
  })

  const filterVideosUseCase = createFilterVideosUseCase()

  return {
    logger,
    eventPublisher,
    videoSessionRegistry,
    videoQueryAdapter,
    addVideosUseCase,
    updateThumbUseCase,
    updatePreviewsUseCase,
    updateVotesUseCase,
    wipeVideoDataUseCase,
    filterVideosUseCase,
  }
}
