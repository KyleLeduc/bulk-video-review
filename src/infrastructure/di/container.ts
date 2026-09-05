import { DatabaseConnection } from '@infra/database/DatabaseConnection'
import { createVideoServices } from './createVideoServices'

export const {
  logger,
  eventPublisher,
  videoSessionRegistry,
  videoQueryAdapter,
  addVideosUseCase,
  updateThumbUseCase,
  updateVotesUseCase,
  wipeVideoDataUseCase,
  filterVideosUseCase,
} = createVideoServices({
  databaseConnection: DatabaseConnection.getInstance(),
})
