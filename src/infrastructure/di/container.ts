import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
  VideoRepository,
} from '@infra/repository'
import {
  FfmpegVideoFileParser,
  VideoFileParser,
  VideoFileParserSelector,
} from '@infra/video'
import {
  ConsoleLoggerAdapter,
  NoOpEventPublisher,
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
const domVideoFileParser = new VideoFileParser()
const ffmpegVideoFileParser = new FfmpegVideoFileParser()
const videoFileParserSelector = new VideoFileParserSelector(
  domVideoFileParser,
  ffmpegVideoFileParser,
)
const videoMetadataExtractorAdapter = new VideoMetadataExtractorAdapter(
  videoFileParserSelector,
  logger,
)
// Adapters
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
  aggregateRepository: videoAggregateRepository,
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
