import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import { MetadataRepository, VideoRepository } from '@infra/repository'
import { VideoMetadataFacade } from '@infra/services'
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

const videoMetadataFacade = new VideoMetadataFacade(
  metadataRepository,
  videoRepository,
  logger,
)

// Infrastructure services
const videoFileParser = new VideoFileParser()

// Adapters
const videoParserAdapter = new VideoParserAdapter(
  videoMetadataFacade,
  logger,
  videoFileParser,
)
// Keep old adapter for backward compatibility if needed
const videoStorageAdapter = new VideoStorageAdapter(videoMetadataFacade)
const videoCommandAdapter = new VideoCommandAdapter(
  videoMetadataFacade,
  eventPublisher,
)
export const videoQueryAdapter = new VideoQueryAdapter(videoMetadataFacade)
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
  videoMetadataFacade,
)

export const filterVideosUseCase = new FilterVideosUseCase()
