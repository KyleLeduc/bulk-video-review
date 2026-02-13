import type { InjectionKey } from 'vue'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import type {
  FilterVideosUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
  VideoIngestionUseCase,
  WipeVideoDataUseCase,
} from '@app/usecases'

export const ADD_VIDEOS_USE_CASE_KEY: InjectionKey<VideoIngestionUseCase> =
  Symbol('AddVideosUseCase')

export const FILTER_VIDEOS_USE_CASE_KEY: InjectionKey<FilterVideosUseCase> =
  Symbol('FilterVideosUseCase')

export const UPDATE_THUMB_USE_CASE_KEY: InjectionKey<UpdateVideoThumbnailsUseCase> =
  Symbol('UpdateVideoThumbnailsUseCase')

export const UPDATE_VOTES_USE_CASE_KEY: InjectionKey<UpdateVideoVotesUseCase> =
  Symbol('UpdateVideoVotesUseCase')

export const LOGGER_KEY: InjectionKey<ILogger> = Symbol('Logger')

export const VIDEO_SESSION_REGISTRY_KEY: InjectionKey<IVideoSessionRegistry> =
  Symbol('VideoSessionRegistry')

export const WIPE_VIDEO_DATA_USE_CASE_KEY: InjectionKey<WipeVideoDataUseCase> =
  Symbol('WipeVideoDataUseCase')
