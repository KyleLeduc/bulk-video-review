import {
  VideoParserAdapter,
  VideoStorageAdapter,
  VideoThumbnailGeneratorAdapter,
} from '@infra/adapters'
import {
  AddVideosFromFilesUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
} from '@app/usecases'

export const addVideosUseCase = new AddVideosFromFilesUseCase(
  new VideoParserAdapter(),
)

export const updateThumbUseCase = new UpdateVideoThumbnailsUseCase(
  new VideoThumbnailGeneratorAdapter(),
  new VideoStorageAdapter(),
)

export const updateVotesUseCase = new UpdateVideoVotesUseCase(
  new VideoStorageAdapter(),
)
