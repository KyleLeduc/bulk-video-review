import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
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

// Infrastructure dependencies
const databaseConnection = DatabaseConnection.getInstance()
const metadataRepository = new MetadataRepository(databaseConnection)
const videoRepository = new VideoRepository(databaseConnection)
const videoIngestionFailureTracker = new VideoIngestionFailureTracker(
  databaseConnection,
)
// Cross-cutting concern adapters
export const logger = new ConsoleLoggerAdapter()
export const eventPublisher = new NoOpEventPublisher()

export const videoSessionRegistry = new VideoSessionRegistry(logger)

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
export const videoQueryAdapter = new VideoQueryAdapter(videoAggregateRepository)
const videoThumbnailGeneratorAdapter = new VideoThumbnailGeneratorAdapter()

// Use cases
export const addVideosUseCase = createLinearVideoIngestionUseCase({
  metadataExtractor: videoMetadataExtractorAdapter,
  aggregateRepository: videoAggregateRepository,
  sessionRegistry: videoSessionRegistry,
  logger,
  failureTracker: videoIngestionFailureTracker,
})

export const updateThumbUseCase = createUpdateVideoThumbnailsUseCase({
  thumbnailGenerator: videoThumbnailGeneratorAdapter,
  aggregateRepository: videoAggregateRepository,
  sessionRegistry: videoSessionRegistry,
  eventPublisher,
})

export const updateVotesUseCase = createUpdateVideoVotesUseCase({
  aggregateRepository: videoAggregateRepository,
  eventPublisher,
})

export const wipeVideoDataUseCase = createWipeVideoDataUseCase({
  repository: videoAggregateRepository,
})

export const filterVideosUseCase = createFilterVideosUseCase()
