import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import {
  MetadataRepository,
  VideoAggregateRepository,
  VideoRepository,
} from '@infra/repository'
import { VideoFileParser } from '@infra/video'
import {
  ConsoleLoggerAdapter,
  NoOpEventPublisher,
  VideoCommandAdapter,
  VideoParserAdapter,
  VideoQueryAdapter,
  VideoStorageAdapter,
  VideoThumbnailGeneratorAdapter,
} from '@infra/adapters'
import {
  AddVideosFromFilesUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
  WipeVideoDataUseCase,
  FilterVideosUseCase,
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
const videoFileParser = new VideoFileParser()

// Adapters
const videoParserAdapter = new VideoParserAdapter(
  videoAggregateRepository,
  logger,
  videoFileParser,
)
// Keep old adapter for backward compatibility if needed
const videoStorageAdapter = new VideoStorageAdapter(videoAggregateRepository)
const videoCommandAdapter = new VideoCommandAdapter(
  videoAggregateRepository,
  eventPublisher,
)
export const videoQueryAdapter = new VideoQueryAdapter(videoAggregateRepository)
const videoThumbnailGeneratorAdapter = new VideoThumbnailGeneratorAdapter()

// Use cases
export const addVideosUseCase = new AddVideosFromFilesUseCase(
  videoParserAdapter,
)

export const updateThumbUseCase = new UpdateVideoThumbnailsUseCase(
  videoThumbnailGeneratorAdapter,
  videoCommandAdapter,
  eventPublisher,
)

export const updateVotesUseCase = new UpdateVideoVotesUseCase(
  videoCommandAdapter,
)

export const wipeVideoDataUseCase = new WipeVideoDataUseCase(
  videoAggregateRepository,
)

export const filterVideosUseCase = new FilterVideosUseCase()
