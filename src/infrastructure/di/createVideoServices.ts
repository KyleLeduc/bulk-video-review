import type { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
  VideoPreviewRepository,
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
} from '@infra/adapters'
import {
  createLinearVideoIngestionUseCase,
  createFilterVideosUseCase,
  createUpdateVideoThumbnailsUseCase,
  createUpdateVideoVotesUseCase,
  createWipeVideoDataUseCase,
} from '@app/usecases'

export function createVideoServices({
  databaseConnection,
}: {
  databaseConnection: DatabaseConnection
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
  })

  const updateThumbUseCase = createUpdateVideoThumbnailsUseCase({
    thumbnailGenerator: videoThumbnailGeneratorAdapter,
    aggregateRepository: videoAggregateRepository,
    sessionRegistry: videoSessionRegistry,
    eventPublisher,
    previewRepository: videoPreviewRepository,
  })

  const updateVotesUseCase = createUpdateVideoVotesUseCase({
    aggregateRepository: videoAggregateRepository,
    eventPublisher,
  })

  const wipeVideoDataUseCase = createWipeVideoDataUseCase({
    repository: videoAggregateRepository,
    previewRepository: videoPreviewRepository,
  })

  const filterVideosUseCase = createFilterVideosUseCase()

  return {
    logger,
    eventPublisher,
    videoSessionRegistry,
    videoQueryAdapter,
    addVideosUseCase,
    updateThumbUseCase,
    updateVotesUseCase,
    wipeVideoDataUseCase,
    filterVideosUseCase,
  }
}
