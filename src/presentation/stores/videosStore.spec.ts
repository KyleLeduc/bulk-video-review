import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('ignores re-uploaded videos without replacing session state', async () => {
    let callCount = 0
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            callCount += 1
            yield {
              type: 'video' as const,
              video: buildParsedVideo({
                id: 'id-1',
                url: callCount === 1 ? 'blob:first' : 'blob:second',
              }),
            }
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
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', url: 'blob:to-remove' }),
            }
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

  test('filters out files the current browser cannot play before invoking ingestion', async () => {
    const { global, mocks } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
    })

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const playable = new File(['video-bytes'], 'sample.mp4', {
      type: 'video/mp4',
    })
    const unsupported = new File(['video-bytes'], 'sample.mov', {
      type: 'video/quicktime',
    })

    await store.addVideosFromFiles(createMockFileList(playable, unsupported))

    expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledWith([
      { file: playable },
    ])
  })

  test('does not re-add a removed video when thumbnail generation finishes later', async () => {
    let resolveUpdate: ((video: ParsedVideo) => void) | undefined

    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', url: 'blob:to-remove' }),
            }
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

  test('clears retained import file handles once a displayed session finishes ingesting', async () => {
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', thumbUrls: ['thumb-1'] }),
            }
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 0,
                newCount: 1,
                knownErrorCount: 0,
                createdCount: 1,
                failedCount: 0,
                completedCount: 1,
              },
            }
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

    await store.addVideosFromFiles(createMockFileList(file))

    expect(store.displayedIngestionSession?.items).toEqual([])
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

  test('tracks thumbnail generation progress for the current ingestion session', async () => {
    vi.useFakeTimers()

    try {
      let resolveThumbnailJob: ((video: ParsedVideo) => void) | undefined

      const { global } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
              }
              yield {
                type: 'progress' as const,
                progress: {
                  total: 1,
                  scanned: 1,
                  existingCount: 0,
                  newCount: 1,
                  knownErrorCount: 0,
                  createdCount: 1,
                  failedCount: 0,
                  completedCount: 1,
                },
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(
              () =>
                new Promise((resolve) => {
                  resolveThumbnailJob = resolve
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

      await store.addVideosFromFiles(createMockFileList(file))

      expect((store as any).thumbnailGenerationProgress).toEqual(
        expect.objectContaining({
          total: 1,
          generatedCount: 0,
          pendingCount: 1,
          failedCount: 0,
        }),
      )

      await vi.advanceTimersByTimeAsync(200)
      expect((store as any).thumbnailGenerationProgress).toEqual(
        expect.objectContaining({
          total: 1,
          generatedCount: 0,
          pendingCount: 1,
          failedCount: 0,
        }),
      )

      resolveThumbnailJob?.(
        buildParsedVideo({
          id: 'id-1',
          thumbUrls: ['thumb-1', 'thumb-2'],
        }),
      )

      await vi.advanceTimersByTimeAsync(0)

      expect((store as any).thumbnailGenerationProgress).toEqual(
        expect.objectContaining({
          total: 1,
          generatedCount: 1,
          pendingCount: 0,
          failedCount: 0,
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test('starts thumbnail generation immediately for a direct warmup request', async () => {
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(
            () =>
              new Promise(() => {
                // Keep pending so the call itself is the assertion target.
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
    store.addVideos([buildParsedVideo({ id: 'id-1', thumbUrls: [] })])

    store.requestThumbnailWarmup('id-1')

    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)
  })

  test('preserves newer pinned state when a delayed thumbnail update resolves', async () => {
    let resolveThumbnailJob: ((video: ParsedVideo) => void) | undefined

    const { global } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(
            () =>
              new Promise((resolve) => {
                resolveThumbnailJob = resolve
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
    const original = buildParsedVideo({
      id: 'id-1',
      pinned: false,
      thumbUrls: [],
    })
    store.addVideos([original])

    const updatePromise = store.updateVideoThumbnails('id-1')
    store.togglePinVideo('id-1')

    resolveThumbnailJob?.({
      ...original,
      pinned: false,
      thumbUrls: ['thumb-1', 'thumb-2'],
    })

    await updatePromise

    expect(store.sortByVotes[0]).toEqual(
      expect.objectContaining({
        id: 'id-1',
        pinned: true,
        thumbUrls: ['thumb-1', 'thumb-2'],
      }),
    )
  })

  test('queues a second import ahead of pending thumbnail drain and resumes thumbnails after the queued import runs', async () => {
    vi.useFakeTimers()

    try {
      let addCallCount = 0
      let resolveThumbnailJob: ((video: ParsedVideo) => void) | undefined

      const { global, mocks } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              addCallCount += 1

              if (addCallCount === 1) {
                yield {
                  type: 'video' as const,
                  video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
                }
                yield {
                  type: 'video' as const,
                  video: buildParsedVideo({ id: 'id-2', thumbUrls: [] }),
                }
                yield {
                  type: 'progress' as const,
                  progress: {
                    total: 2,
                    scanned: 2,
                    existingCount: 0,
                    newCount: 2,
                    knownErrorCount: 0,
                    createdCount: 2,
                    failedCount: 0,
                    completedCount: 2,
                  },
                }
                return
              }

              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-3', thumbUrls: [] }),
              }
              yield {
                type: 'progress' as const,
                progress: {
                  total: 1,
                  scanned: 1,
                  existingCount: 0,
                  newCount: 1,
                  knownErrorCount: 0,
                  createdCount: 1,
                  failedCount: 0,
                  completedCount: 1,
                },
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(
              () =>
                new Promise((resolve) => {
                  resolveThumbnailJob = resolve
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
      store.setThumbnailConcurrencyOverride(1)

      const firstBatch = createMockFileList(
        new File(['video-1'], 'batch-a-1.mp4', { type: 'video/mp4' }),
      )
      const secondBatch = createMockFileList(
        new File(['video-2'], 'batch-b-1.mp4', { type: 'video/mp4' }),
      )

      await store.addVideosFromFiles(firstBatch)
      await vi.advanceTimersByTimeAsync(200)

      expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledTimes(1)
      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)

      const queuedImportPromise = store.addVideosFromFiles(secondBatch)
      await vi.advanceTimersByTimeAsync(0)

      expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledTimes(1)
      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)

      resolveThumbnailJob?.(
        buildParsedVideo({
          id: 'id-1',
          thumbUrls: ['thumb-1', 'thumb-2'],
        }),
      )
      await vi.advanceTimersByTimeAsync(0)
      await queuedImportPromise

      expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledTimes(2)
      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(200)

      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
