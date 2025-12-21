import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, test, vi } from 'vitest'
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
import { useVideoStore } from '@presentation/stores'

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

const StoreHarness = defineComponent({
  name: 'StoreHarness',
  setup() {
    const store = useVideoStore()
    return { store }
  },
  template: '<div />',
})

describe('useVideoStore', () => {
  test('ignores re-uploaded videos without replacing session state', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    let callCount = 0
    const addVideosUseCase: AddVideosFromFilesUseCase = {
      execute: vi.fn(async function* () {
        callCount += 1
        yield {
          id: 'id-1',
          title: 'sample.mp4',
          thumb: '',
          duration: 0,
          thumbUrls: [],
          tags: [],
          votes: 0,
          url: callCount === 1 ? 'blob:first' : 'blob:second',
          pinned: false,
        }
      }),
    } as unknown as AddVideosFromFilesUseCase

    const filterVideosUseCase: FilterVideosUseCase = {
      execute: vi.fn((request) => request.videos),
    } as unknown as FilterVideosUseCase

    const updateThumbUseCase: UpdateVideoThumbnailsUseCase = {
      execute: vi.fn(async (video) => video),
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

    const wrapper = mount(StoreHarness, {
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

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)
    expect(store.sortByVotes[0]?.url).toBe('blob:first')

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)
    expect(store.sortByVotes[0]?.url).toBe('blob:first')
    expect(sessionRegistry.unregisterFile).not.toHaveBeenCalled()
  })

  test('releases session registry entries when videos are removed', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const addVideosUseCase: AddVideosFromFilesUseCase = {
      execute: vi.fn(async function* () {
        yield {
          id: 'id-1',
          title: 'sample.mp4',
          thumb: '',
          duration: 0,
          thumbUrls: [],
          tags: [],
          votes: 0,
          url: 'blob:to-remove',
          pinned: false,
        }
      }),
    } as unknown as AddVideosFromFilesUseCase

    const filterVideosUseCase: FilterVideosUseCase = {
      execute: vi.fn((request) => request.videos),
    } as unknown as FilterVideosUseCase

    const updateThumbUseCase: UpdateVideoThumbnailsUseCase = {
      execute: vi.fn(async (video) => video),
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

    const wrapper = mount(StoreHarness, {
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

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)

    store.removeVideo('id-1')
    expect(store.sortByVotes).toHaveLength(0)
    expect(sessionRegistry.unregisterFile).toHaveBeenCalledWith('id-1')
  })
})
