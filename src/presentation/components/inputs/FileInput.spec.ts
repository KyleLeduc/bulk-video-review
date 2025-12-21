import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, test, vi } from 'vitest'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
  VIDEO_SESSION_REGISTRY_KEY,
} from '@presentation/di/injectionKeys'
import type {
  AddVideosFromFilesUseCase,
  FilterVideosUseCase,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
} from '@app/usecases'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import FileInput from './FileInput.vue'

const createMockFileList = (...files: File[]): FileList => {
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

describe('FileInput', () => {
  test('clears the input value after handling a selection so the same files can be reselected', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const addVideosUseCase: AddVideosFromFilesUseCase = {
      execute: vi.fn(async function* () {
        yield* []
      }),
    } as unknown as AddVideosFromFilesUseCase

    const filterVideosUseCase: FilterVideosUseCase = {
      execute: vi.fn(() => []),
    } as unknown as FilterVideosUseCase

    const updateThumbUseCase: UpdateVideoThumbnailsUseCase = {
      execute: vi.fn(async () => ({}) as any),
    } as unknown as UpdateVideoThumbnailsUseCase

    const updateVotesUseCase: UpdateVideoVotesUseCase = {
      execute: vi.fn(async () => null),
    } as unknown as UpdateVideoVotesUseCase

    const logger: ILogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }

    const sessionRegistry: IVideoSessionRegistry = {
      registerFile: vi.fn(),
      unregisterFile: vi.fn(),
      acquireObjectUrl: vi.fn(() => ''),
      releaseObjectUrl: vi.fn(),
    }

    const wrapper = mount(FileInput, {
      global: {
        plugins: [pinia],
        provide: {
          [ADD_VIDEOS_USE_CASE_KEY as symbol]: addVideosUseCase,
          [FILTER_VIDEOS_USE_CASE_KEY as symbol]: filterVideosUseCase,
          [UPDATE_THUMB_USE_CASE_KEY as symbol]: updateThumbUseCase,
          [UPDATE_VOTES_USE_CASE_KEY as symbol]: updateVotesUseCase,
          [LOGGER_KEY as symbol]: logger,
          [VIDEO_SESSION_REGISTRY_KEY as symbol]: sessionRegistry,
        },
      },
    })

    const input = wrapper.get('input[type="file"]')
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    Object.defineProperty(input.element, 'files', {
      value: files,
      writable: false,
    })

    let currentValue = 'C:\\\\fakepath\\\\sample.mp4'
    let clearCalls = 0
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      get: () => currentValue,
      set: (next: string) => {
        clearCalls += 1
        currentValue = next
      },
    })

    await input.trigger('change')
    await new Promise((resolve) => setTimeout(resolve))

    expect(addVideosUseCase.execute).toHaveBeenCalledTimes(1)
    expect(clearCalls).toBe(1)
    expect(currentValue).toBe('')
  })
})
