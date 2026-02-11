import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import type { ParsedVideo, VideoAggregate, VideoEntity } from '@domain/entities'
import type {
  AddVideosFromFilesUseCase,
  FilterVideosUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
} from '@app/usecases'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
  VIDEO_SESSION_REGISTRY_KEY,
} from '@presentation/di/injectionKeys'

type UseCaseMock<T extends { execute: (...args: any[]) => any }> = {
  execute: T['execute']
}

type UseCaseMocks = {
  addVideosUseCase: UseCaseMock<AddVideosFromFilesUseCase>
  filterVideosUseCase: UseCaseMock<FilterVideosUseCase>
  updateThumbUseCase: UseCaseMock<UpdateVideoThumbnailsUseCase>
  updateVotesUseCase: UseCaseMock<UpdateVideoVotesUseCase>
}

type PresentationTestContext = {
  pinia: ReturnType<typeof createPinia>
  mocks: {
    useCases: UseCaseMocks
    logger: ILogger
    sessionRegistry: IVideoSessionRegistry
  }
  global: {
    plugins: ReturnType<typeof createPinia>[]
    provide: Record<symbol, unknown>
  }
}

export const createMockFileList = (...files: File[]): FileList => {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const file of files) {
        yield file
      }
    },
  } as unknown as FileList

  files.forEach((file, index) => {
    ;(fileList as Record<number, File>)[index] = file
  })

  return fileList
}

export const buildLogger = (overrides: Partial<ILogger> = {}): ILogger => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  ...overrides,
})

export const buildSessionRegistry = (
  overrides: Partial<IVideoSessionRegistry> = {},
): IVideoSessionRegistry => ({
  registerFile: vi.fn(),
  unregisterFile: vi.fn(),
  acquireObjectUrl: vi.fn(() => null),
  releaseObjectUrl: vi.fn(),
  ...overrides,
})

export const buildVideoEntity = (
  overrides: Partial<VideoEntity> = {},
): VideoEntity => ({
  id: 'id-1',
  title: 'sample.mp4',
  thumb: '',
  duration: 0,
  thumbUrls: [],
  tags: [],
  ...overrides,
})

export const buildVideoAggregate = (
  overrides: Partial<VideoAggregate> = {},
): VideoAggregate => ({
  ...buildVideoEntity(),
  votes: 0,
  ...overrides,
})

export const buildParsedVideo = (
  overrides: Partial<ParsedVideo> = {},
): ParsedVideo => ({
  ...buildVideoAggregate(),
  url: '',
  pinned: false,
  ...overrides,
})

export const createPresentationTestContext = (
  overrides: Partial<{
    useCases: Partial<UseCaseMocks>
    logger: Partial<ILogger>
    sessionRegistry: Partial<IVideoSessionRegistry>
  }> = {},
): PresentationTestContext => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const addVideosUseCase: UseCaseMock<AddVideosFromFilesUseCase> = {
    execute: vi.fn(async function* () {
      yield* []
    }),
  }

  const filterVideosUseCase: UseCaseMock<FilterVideosUseCase> = {
    execute: vi.fn((request) => request.videos),
  }

  const updateThumbUseCase: UseCaseMock<UpdateVideoThumbnailsUseCase> = {
    execute: vi.fn(async (video) => video),
  }

  const updateVotesUseCase: UseCaseMock<UpdateVideoVotesUseCase> = {
    execute: vi.fn(async () => null),
  }

  const useCases: UseCaseMocks = {
    addVideosUseCase,
    filterVideosUseCase,
    updateThumbUseCase,
    updateVotesUseCase,
    ...(overrides.useCases ?? {}),
  }

  const logger = buildLogger(overrides.logger)
  const sessionRegistry = buildSessionRegistry(overrides.sessionRegistry)

  return {
    pinia,
    mocks: {
      useCases,
      logger,
      sessionRegistry,
    },
    global: {
      plugins: [pinia],
      provide: {
        [ADD_VIDEOS_USE_CASE_KEY as symbol]: useCases.addVideosUseCase,
        [FILTER_VIDEOS_USE_CASE_KEY as symbol]: useCases.filterVideosUseCase,
        [UPDATE_THUMB_USE_CASE_KEY as symbol]: useCases.updateThumbUseCase,
        [UPDATE_VOTES_USE_CASE_KEY as symbol]: useCases.updateVotesUseCase,
        [LOGGER_KEY as symbol]: logger,
        [VIDEO_SESSION_REGISTRY_KEY as symbol]: sessionRegistry,
      },
    },
  }
}
