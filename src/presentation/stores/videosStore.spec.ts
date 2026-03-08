import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import type { ParsedVideo } from '@domain/entities'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'

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
    let callCount = 0
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            callCount += 1
            yield buildParsedVideo({
              id: 'id-1',
              url: callCount === 1 ? 'blob:first' : 'blob:second',
            })
          }),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
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
    expect(mocks.sessionRegistry.unregisterFile).not.toHaveBeenCalled()
  })

  test('releases session registry entries when videos are removed', async () => {
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield buildParsedVideo({ id: 'id-1', url: 'blob:to-remove' })
          }),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
    })

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)

    store.removeVideo('id-1')
    expect(store.sortByVotes).toHaveLength(0)
    expect(mocks.sessionRegistry.unregisterFile).toHaveBeenCalledWith('id-1')
  })

  test('does not re-add a removed video when thumbnail generation finishes later', async () => {
    let resolveUpdate: ((video: ParsedVideo) => void) | undefined

    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield buildParsedVideo({ id: 'id-1', url: 'blob:to-remove' })
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            () =>
              new Promise((resolve) => {
                resolveUpdate = resolve
              }),
          ),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
    })

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)

    const updatePromise = store.updateVideoThumbnails('id-1')
    store.removeVideo('id-1')

    resolveUpdate?.(
      buildParsedVideo({
        id: 'id-1',
        thumbUrls: ['thumb-1', 'thumb-2'],
      }),
    )

    await updatePromise

    expect(store.sortByVotes).toHaveLength(0)
  })

  test('queues missing thumbnails in the background after ingestion', async () => {
    vi.useFakeTimers()

    try {
      const { global, mocks } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(async (video) =>
              buildParsedVideo({
                ...video,
                thumbUrls: ['thumb-1', 'thumb-2'],
              }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(StoreHarness, {
        global,
      })

      const store = (wrapper.vm as any).store as ReturnType<
        typeof useVideoStore
      >
      const file = new File(['video-bytes'], 'sample.mp4', {
        type: 'video/mp4',
      })
      const files = createMockFileList(file)

      await store.addVideosFromFiles(files)
      expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)

      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)
      expect(store.sortByVotes[0]?.thumbUrls).toEqual(['thumb-1', 'thumb-2'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('waits for the full import pass to finish before starting background thumbnails', async () => {
    vi.useFakeTimers()

    try {
      let finishImport: (() => void) | undefined

      const { global, mocks } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
              }

              await new Promise<void>((resolve) => {
                finishImport = resolve
              })
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(async (video) =>
              buildParsedVideo({
                ...video,
                thumbUrls: ['thumb-1', 'thumb-2'],
              }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(StoreHarness, {
        global,
      })

      const store = (wrapper.vm as any).store as ReturnType<
        typeof useVideoStore
      >
      const file = new File(['video-bytes'], 'sample.mp4', {
        type: 'video/mp4',
      })
      const files = createMockFileList(file)

      const addPromise = store.addVideosFromFiles(files)
      await vi.advanceTimersByTimeAsync(0)

      expect(store.sortByVotes).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(200)
      expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

      finishImport?.()
      await addPromise

      await vi.advanceTimersByTimeAsync(200)
      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test('tracks ingestion timing separately from thumbnail warmup', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'))

    try {
      let finishImport: (() => void) | undefined

      const { global } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
              }

              await new Promise<void>((resolve) => {
                finishImport = resolve
              })
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(async (video) =>
              buildParsedVideo({
                ...video,
                thumbUrls: ['thumb-1', 'thumb-2'],
              }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(StoreHarness, {
        global,
      })

      const store = (wrapper.vm as any).store as ReturnType<
        typeof useVideoStore
      >
      const file = new File(['video-bytes'], 'sample.mp4', {
        type: 'video/mp4',
      })
      const files = createMockFileList(file)

      const addPromise = store.addVideosFromFiles(files)
      expect((store as any).ingestionStartedAtMs).toBe(Date.now())
      expect((store as any).ingestionCompletedAtMs).toBeNull()

      await vi.advanceTimersByTimeAsync(1200)
      finishImport?.()
      await addPromise

      const completedAtMs = (store as any).ingestionCompletedAtMs
      expect(completedAtMs).toBe(Date.now())

      await vi.advanceTimersByTimeAsync(1000)
      expect((store as any).ingestionCompletedAtMs).toBe(completedAtMs)
    } finally {
      vi.useRealTimers()
    }
  })
})
