import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ParsedVideo, VideoPreviewFrame } from '@domain/entities'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'

const StoreHarness = defineComponent({
  name: 'PreviewSchedulerStoreHarness',
  setup() {
    return { store: useVideoStore() }
  },
  template: '<div />',
})

const buildPreviewFrames = (): VideoPreviewFrame[] =>
  Array.from({ length: 9 }, (_, index) => ({
    timestampSeconds: (index + 1) * 2,
    blob: new Blob([`frame-${index}`], { type: 'image/jpeg' }),
    width: 480,
    height: 270,
  }))

const markReady = (video: ParsedVideo) =>
  buildParsedVideo({ ...video, previewFrames: buildPreviewFrames() })

describe('useVideoStore preview scheduler', () => {
  test.each(['resolve', 'reject'] as const)(
    'an old removed attempt cannot %s over a new same-ID job',
    async (outcome) => {
      const attempts: { finish: () => void }[] = []
      const execute = vi.fn(
        (
          video: ParsedVideo,
          options?: { signal?: AbortSignal },
        ): Promise<ParsedVideo> => {
          if (attempts.length >= 2) return Promise.resolve(markReady(video))
          return new Promise((resolve, reject) => {
            const first = attempts.length === 0
            attempts.push({
              finish: () => {
                if (first) {
                  if (outcome === 'resolve') resolve(markReady(video))
                  else reject(new Error('late failure from removed file'))
                } else reject(new DOMException('Paused', 'AbortError'))
              },
            })
            expect(options?.signal).toBeDefined()
          })
        },
      )
      const { global, mocks } = createPresentationTestContext({
        useCases: { updateThumbUseCase: { execute } },
      })
      const wrapper = mount(StoreHarness, { global })
      const store = useVideoStore()
      store.setThumbnailConcurrencyOverride(2)
      store.addVideos([buildParsedVideo({ id: 'same' })])
      const old = store.updateVideoThumbnails('same')
      store.removeVideo('same')
      store.addVideos([buildParsedVideo({ id: 'same' })])
      const settled = vi.fn()
      const replacement = store.updateVideoThumbnails('same').then(settled)
      store.setPreviewProcessingPaused(true)
      attempts[0].finish()
      await flushPromises()
      expect(settled).not.toHaveBeenCalled()
      attempts[1].finish()
      await flushPromises()
      expect(store.getThumbnailJobState('same')).toBe('queued')
      store.setPreviewProcessingPaused(false)
      await Promise.all([old, replacement])
      expect(store.allVideos[0].previewFrames).toHaveLength(9)
      expect(execute).toHaveBeenCalledTimes(3)
      expect(mocks.logger.error).not.toHaveBeenCalled()
      wrapper.unmount()
    },
  )
  test.each(['reject', 'late completion'] as const)(
    'requeues a paused attempt on %s without settling its promise',
    async (outcome) => {
      let finish: () => void = () => {}
      let firstSignal: AbortSignal | undefined
      const execute = vi
        .fn()
        .mockImplementationOnce(
          (video: ParsedVideo, options: { signal: AbortSignal }) =>
            new Promise((resolve, reject) => {
              firstSignal = options.signal
              finish = () =>
                outcome === 'reject'
                  ? reject(new DOMException('Paused', 'AbortError'))
                  : resolve(markReady(video))
            }),
        )
        .mockImplementation(async (video: ParsedVideo) => markReady(video))
      const { global } = createPresentationTestContext({
        useCases: { updateThumbUseCase: { execute } },
      })
      const wrapper = mount(StoreHarness, { global })
      const store = useVideoStore()
      store.addVideos([
        buildParsedVideo({
          id: 'partial',
          previewFrames: buildPreviewFrames().slice(0, 8),
        }),
      ])
      const settled = vi.fn()
      const pending = store.updateVideoThumbnails('partial').then(settled)
      expect(execute).toHaveBeenCalledOnce()
      store.setPreviewProcessingPaused(true)
      expect(firstSignal?.aborted).toBe(true)
      finish()
      await flushPromises()
      expect(store.getThumbnailJobState('partial')).toBe('queued')
      expect(store.allVideos[0].previewFrames).toHaveLength(8)
      expect(settled).not.toHaveBeenCalled()
      store.setPreviewProcessingPaused(false)
      store.setPreviewProcessingPaused(false)
      await pending
      expect(execute).toHaveBeenCalledTimes(2)
      expect(store.allVideos[0].previewFrames).toHaveLength(9)
      expect(store.getThumbnailJobState('partial')).toBe('ready')
      wrapper.unmount()
    },
  )

  test('does not declare an eight-frame adapter result complete', async () => {
    const { global } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(async (video) => ({
            ...video,
            previewFrames: buildPreviewFrames().slice(0, 8),
          })),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = useVideoStore()
    store.addVideos([buildParsedVideo({ id: 'partial' })])
    await store.updateVideoThumbnails('partial')
    expect(store.getThumbnailJobDiagnostic('partial')).toMatchObject({
      state: 'failed',
      completedFrames: 8,
      totalFrames: 9,
    })
    wrapper.unmount()
  })

  test('repairs the retained partial entry when reimport hydrates a complete cached entry', async () => {
    vi.useFakeTimers()
    const video = buildParsedVideo({
      id: 'cached',
      previewFrames: buildPreviewFrames(),
    })
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield { type: 'video' as const, video }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(async (current) => markReady(current)),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = useVideoStore()
    store.addVideos([
      {
        ...video,
        previewFrames: video.previewFrames.slice(0, 2),
        url: 'blob:live',
        pinned: true,
        votes: 3,
      },
    ])
    await store.addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'video.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(200)
    expect(store.allVideos[0]).toMatchObject({
      url: 'blob:live',
      pinned: true,
      votes: 3,
    })
    expect(store.allVideos[0].previewFrames).toHaveLength(9)
    wrapper.unmount()
  })
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('settles a storage transaction abort as failure instead of leaving the import pending', async () => {
    vi.useFakeTimers()
    const storageError = new DOMException('Late storage abort', 'AbortError')
    let signal: AbortSignal | undefined
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'video-1' }),
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(async (_video, options) => {
            signal = options?.signal
            throw storageError
          }),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    await store.addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'video.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(200)

    expect(signal?.aborted).toBe(false)
    expect(store.getThumbnailJobState('video-1')).toBe('failed')
    expect(store.createDisplayedIngestionRunReport()?.status).toBe('completed')
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to update thumbnails',
      storageError,
    )
    wrapper.unmount()
  })

  test('runs one preview job at a time by default', async () => {
    const pending: Array<{
      video: ParsedVideo
      resolve: (video: ParsedVideo) => void
    }> = []
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo) =>
              new Promise<ParsedVideo>((resolve) => {
                pending.push({ video, resolve })
              }),
          ),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    store.addVideos([
      buildParsedVideo({ id: 'video-1' }),
      buildParsedVideo({ id: 'video-2' }),
    ])

    store.requestThumbnailWarmup('video-1')
    store.requestThumbnailWarmup('video-2')

    expect(store.autoThumbnailConcurrency).toBe(1)
    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)

    pending[0]?.resolve(markReady(pending[0].video))
    await flushPromises()

    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(2)
    pending[1]?.resolve(markReady(pending[1].video))
    await flushPromises()
  })

  test('allows an explicit concurrency override but caps it at four jobs', async () => {
    const pending: Array<{
      video: ParsedVideo
      resolve: (video: ParsedVideo) => void
    }> = []
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo) =>
              new Promise<ParsedVideo>((resolve) => {
                pending.push({ video, resolve })
              }),
          ),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    store.setThumbnailConcurrencyOverride(99)
    store.addVideos([
      buildParsedVideo({ id: 'video-1' }),
      buildParsedVideo({ id: 'video-2' }),
      buildParsedVideo({ id: 'video-3' }),
      buildParsedVideo({ id: 'video-4' }),
    ])

    store.requestThumbnailWarmup('video-1')
    store.requestThumbnailWarmup('video-2')
    store.requestThumbnailWarmup('video-3')
    store.requestThumbnailWarmup('video-4')

    expect(store.effectiveThumbnailConcurrency).toBe(4)
    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(4)

    pending[0]?.resolve(markReady(pending[0].video))
    await flushPromises()
    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(4)

    pending.slice(1).forEach(({ video, resolve }) => resolve(markReady(video)))
    await flushPromises()
  })

  test('aborts active preview work for a new import and requeues it afterward', async () => {
    vi.useFakeTimers()
    let firstSignal: AbortSignal | undefined
    const updateThumbUseCase = {
      execute: vi
        .fn()
        .mockImplementationOnce(
          (
            _video: ParsedVideo,
            options?: { signal?: AbortSignal },
          ): Promise<ParsedVideo> =>
            new Promise((_resolve, reject) => {
              firstSignal = options?.signal
              options?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('interrupted', 'AbortError')),
                { once: true },
              )
            }),
        )
        .mockImplementationOnce(async (video: ParsedVideo) => markReady(video)),
    }
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield* []
          }),
        },
        updateThumbUseCase,
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    store.addVideos([buildParsedVideo({ id: 'video-1' })])
    store.requestThumbnailWarmup('video-1')

    const importPromise = store.addVideosFromFiles(
      createMockFileList(
        new File(['new-video'], 'new.mp4', { type: 'video/mp4' }),
      ),
    )
    await flushPromises()

    expect(firstSignal?.aborted).toBe(true)
    await importPromise
    expect(updateThumbUseCase.execute).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)

    expect(updateThumbUseCase.execute).toHaveBeenCalledTimes(2)
    expect(store.getThumbnailJobState('video-1')).toBe('ready')
    expect(mocks.logger.error).not.toHaveBeenCalledWith(
      'Failed to update thumbnails',
      expect.anything(),
    )
  })

  test('aborts a removed video without requeueing or logging a failure', async () => {
    let signal: AbortSignal | undefined
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(
            (
              _video: ParsedVideo,
              options?: { signal?: AbortSignal },
            ): Promise<ParsedVideo> =>
              new Promise((_resolve, reject) => {
                signal = options?.signal
                options?.signal?.addEventListener(
                  'abort',
                  () => reject(new DOMException('removed', 'AbortError')),
                  { once: true },
                )
              }),
          ),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    store.addVideos([buildParsedVideo({ id: 'video-1' })])
    store.requestThumbnailWarmup('video-1')

    store.removeVideo('video-1')
    await flushPromises()

    expect(signal?.aborted).toBe(true)
    expect(store.getThumbnailJobState('video-1')).toBeUndefined()
    expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledOnce()
    expect(mocks.logger.error).not.toHaveBeenCalledWith(
      'Failed to update thumbnails',
      expect.anything(),
    )
  })

  test('records per-job progress, output size, dimensions, and elapsed time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    const frames = buildPreviewFrames()
    const { global } = createPresentationTestContext({
      useCases: {
        updateThumbUseCase: {
          execute: vi.fn(async (video: ParsedVideo, options?: any) => {
            options?.onProgress?.({
              stage: 'encoding',
              completedFrames: 1,
              totalFrames: 2,
              timestampSeconds: 2,
            })
            vi.setSystemTime(new Date('2026-08-22T12:00:00.125Z'))
            return buildParsedVideo({ ...video, previewFrames: frames })
          }),
        },
      },
    })
    const wrapper = mount(StoreHarness, { global })
    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    store.addVideos([buildParsedVideo({ id: 'video-1' })])

    await store.updateVideoThumbnails('video-1')

    expect(store.getThumbnailJobDiagnostic('video-1')).toEqual(
      expect.objectContaining({
        state: 'ready',
        stage: 'encoding',
        completedFrames: 9,
        totalFrames: 9,
        outputBytes: frames.reduce(
          (total, frame) => total + frame.blob.size,
          0,
        ),
        width: 480,
        height: 270,
        elapsedMs: 125,
      }),
    )
  })
})
