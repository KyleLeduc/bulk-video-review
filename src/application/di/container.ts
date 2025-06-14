import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import { MetadataRepository, VideoRepository } from '@infra/repository'
import { VideoMetadataFacade } from '@infra/services'
import { VideoFileParser } from '@infra/video'
import {
  VideoParserAdapter,
  VideoStorageAdapter,
  VideoThumbnailGeneratorAdapter,
} from '@infra/adapters'
import {
  AddVideosFromFilesUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
  WipeVideoDataUseCase,
} from '@app/usecases'

// Infrastructure dependencies
const databaseConnection = DatabaseConnection.getInstance()
const metadataRepository = new MetadataRepository(databaseConnection)
const videoRepository = new VideoRepository(databaseConnection)
const videoMetadataFacade = new VideoMetadataFacade(
  metadataRepository,
  videoRepository,
)

// Infrastructure services
const videoFileParser = new VideoFileParser()

// Adapters
const videoParserAdapter = new VideoParserAdapter(
  videoMetadataFacade,
  videoFileParser,
)
const videoStorageAdapter = new VideoStorageAdapter(videoMetadataFacade)
const videoThumbnailGeneratorAdapter = new VideoThumbnailGeneratorAdapter()

// Use cases
export const addVideosUseCase = new AddVideosFromFilesUseCase(
  videoParserAdapter,
)

export const updateThumbUseCase = new UpdateVideoThumbnailsUseCase(
  videoThumbnailGeneratorAdapter,
  videoStorageAdapter,
)

export const updateVotesUseCase = new UpdateVideoVotesUseCase(
  videoStorageAdapter,
)

export const wipeVideoDataUseCase = new WipeVideoDataUseCase(
  videoMetadataFacade,
)
