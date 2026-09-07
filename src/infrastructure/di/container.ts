import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import { createVideoServices } from './createVideoServices'

export const {
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
  inspectFailedFiles,
  libraryBackup,
} = createVideoServices({
  databaseConnection: DatabaseConnection.getInstance(),
})
