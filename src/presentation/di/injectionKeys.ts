import type { InjectionKey } from 'vue'
import type { InspectFailedVideoFilesUseCase } from '@app/usecases/InspectFailedVideoFilesUseCase'
import type { ILibraryBackup } from '@app/ports/ILibraryBackup'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import type {
  FilterVideosUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoPreviewsUseCase,
  UpdateVideoVotesUseCase,
  VideoIngestionUseCase,
  WipeVideoDataUseCase,
} from '@app/usecases'

export const ADD_VIDEOS_USE_CASE_KEY: InjectionKey<VideoIngestionUseCase> =
  Symbol('AddVideosUseCase')

export const INSPECT_FAILED_FILES_KEY: InjectionKey<
  Pick<InspectFailedVideoFilesUseCase, 'execute'>
> = Symbol('InspectFailedFiles')
export const LIBRARY_BACKUP_KEY: InjectionKey<ILibraryBackup> =
  Symbol('LibraryBackup')

export const FILTER_VIDEOS_USE_CASE_KEY: InjectionKey<FilterVideosUseCase> =
  Symbol('FilterVideosUseCase')

export const UPDATE_THUMB_USE_CASE_KEY: InjectionKey<UpdateVideoThumbnailsUseCase> =
  Symbol('UpdateVideoThumbnailsUseCase')

export const UPDATE_PREVIEWS_USE_CASE_KEY: InjectionKey<
  Pick<UpdateVideoPreviewsUseCase, 'execute'>
> = Symbol('UpdateVideoPreviewsUseCase')

export const UPDATE_VOTES_USE_CASE_KEY: InjectionKey<UpdateVideoVotesUseCase> =
  Symbol('UpdateVideoVotesUseCase')

export const LOGGER_KEY: InjectionKey<ILogger> = Symbol('Logger')

export const VIDEO_SESSION_REGISTRY_KEY: InjectionKey<IVideoSessionRegistry> =
  Symbol('VideoSessionRegistry')

export const WIPE_VIDEO_DATA_USE_CASE_KEY: InjectionKey<WipeVideoDataUseCase> =
  Symbol('WipeVideoDataUseCase')
