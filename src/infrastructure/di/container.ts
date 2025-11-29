import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
  VideoRepository,
} from '@infra/repository'
import {
  DefaultVideoProcessorFactory,
  FileHashGenerator,
  VideoFileParser,
  VideoProcessingPipeline,
} from '@infra/video'
import {
  ConsoleLoggerAdapter,
  NoOpEventPublisher,
  VideoCommandAdapter,
  VideoMetadataExtractorAdapter,
  VideoQueryAdapter,
  VideoThumbnailGeneratorAdapter,
} from '@infra/adapters'
import {
  createAddVideosFromFilesUseCase,
  createFilterVideosUseCase,
  createUpdateVideoThumbnailsUseCase,
  createUpdateVideoVotesUseCase,
  createWipeVideoDataUseCase,
} from '@app/usecases'

// Infrastructure dependencies
const databaseConnection = DatabaseConnection.getInstance()
const metadataRepository = new MetadataRepository(databaseConnection)
const videoRepository = new VideoRepository(databaseConnection)
// Cross-cutting concern adapters
export const logger = new ConsoleLoggerAdapter()
export const eventPublisher = new NoOpEventPublisher()

const videoAggregateRepository = new VideoAggregateRepository(
  metadataRepository,
  videoRepository,
  logger,
)

// Infrastructure services
const videoProcessorFactory = new DefaultVideoProcessorFactory()
const fileHashGenerator = new FileHashGenerator()
const videoProcessingPipeline = new VideoProcessingPipeline(
  videoProcessorFactory,
  fileHashGenerator,
)
const videoFileParser = new VideoFileParser(
  videoProcessorFactory,
  fileHashGenerator,
  videoProcessingPipeline,
)
const videoMetadataExtractorAdapter = new VideoMetadataExtractorAdapter(
  videoFileParser,
)
// Adapters
const videoCommandAdapter = new VideoCommandAdapter(
  videoAggregateRepository,
  eventPublisher,
)
export const videoQueryAdapter = new VideoQueryAdapter(videoAggregateRepository)
const videoThumbnailGeneratorAdapter = new VideoThumbnailGeneratorAdapter()

// Use cases
export const addVideosUseCase = createAddVideosFromFilesUseCase({
  metadataExtractor: videoMetadataExtractorAdapter,
  aggregateRepository: videoAggregateRepository,
  logger,
})

export const updateThumbUseCase = createUpdateVideoThumbnailsUseCase({
  thumbnailGenerator: videoThumbnailGeneratorAdapter,
  videoCommand: videoCommandAdapter,
  eventPublisher,
})

export const updateVotesUseCase = createUpdateVideoVotesUseCase({
  videoCommand: videoCommandAdapter,
})

export const wipeVideoDataUseCase = createWipeVideoDataUseCase({
  repository: videoAggregateRepository,
})

export const filterVideosUseCase = createFilterVideosUseCase()
