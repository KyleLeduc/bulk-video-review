import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, toRaw } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { UpdateVideoPreviewsUseCase } from '@app/usecases'
import type { PreviewEnrichmentOptions } from '@app/usecases/UpdateVideoPreviewsUseCase'
import type { VideoPreviewProduct } from '@domain/repositories/IVideoPreviewCacheRepository'
import {
  keyframeTargets,
  motionClipWindows,
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  MOTION_FALLBACK_VERSION,
} from '@domain/services/videoPreviewPolicy'
import {
  buildParsedVideo,
  createPresentationTestContext,
  createMockFileList,
} from '@test-utils/index'
import { UPDATE_PREVIEWS_USE_CASE_KEY } from '@presentation/di/injectionKeys'
import IngestionStatusToast from '@presentation/components/utils/IngestionStatusToast.vue'
import { useVideoStore } from './videosStore'

const Harness = defineComponent({
  setup: () => ({ store: useVideoStore() }),
  template: '<div />',
})
const video = (id = 'v') =>
  buildParsedVideo({
    id,
    duration: 60,
    url: 'blob:original',
    thumbUrls: Array(9).fill('legacy'),
  })
const clips = () =>
  motionClipWindows(60).map(({ start, end }) => ({
    timestampSeconds: start,
    durationSeconds: end - start,
    blob: new Blob(['mp4'], { type: 'video/mp4' }),
    width: 320,
    height: 180,
  }))
const keyframes = () =>
  keyframeTargets(60).map((timestampSeconds) => ({
    timestampSeconds,
    blob: new Blob(['jpg'], { type: 'image/jpeg' }),
    width: 160,
    height: 90,
  }))
function setup() {
  const files = new Map<string, File>()
  const context = createPresentationTestContext({
    sessionRegistry: {
      acquireObjectUrl: vi.fn(() => 'blob:original'),
      getFile: vi.fn((id: string) => {
        if (!files.has(id)) files.set(id, new File(['v'], `${id}.mp4`))
        return files.get(id)!
      }),
    },
  })
  const generator = {
    generateMotionClips: vi.fn<
      (file: File) => Promise<ReturnType<typeof clips>>
    >(async () => clips()),
    generateKeyframes: vi.fn<
      (
        _file: File,
        _options: { signal: AbortSignal },
      ) => Promise<ReturnType<typeof keyframes>>
    >(async () => keyframes()),
  }
  const cache = {
    epoch: 0,
    getProducts: vi.fn(),
    putProduct: vi.fn(async () => {}),
    clear: vi.fn(),
  }
  const thumbnails = {
    generateThumbnails: vi.fn(async () => [] as ReturnType<typeof keyframes>),
  }
  const useCase = new UpdateVideoPreviewsUseCase(
    generator,
    { getVideo: vi.fn(async (id: string) => video(id)) },
    context.mocks.sessionRegistry,
    cache,
    context.mocks.logger,
    thumbnails,
  )
  context.global.provide[UPDATE_PREVIEWS_USE_CASE_KEY as symbol] = useCase
  const wrapper = mount(Harness, { global: context.global })
  const store = useVideoStore()
  store.addVideos([video()])
  return { ...context, wrapper, store, generator, cache, thumbnails }
}
afterEach(() => vi.restoreAllMocks())

describe('motion preview queue integration', () => {
  test.each([3, 60])(
    'reports matching fallback totals for a %s second source',
    async (duration) => {
      const { store, generator, thumbnails, wrapper } = setup()
      const id = 'fallback-counts'
      store.addVideos([{ ...video(id), duration }])
      generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
      thumbnails.generateThumbnails.mockResolvedValue(
        Array.from({ length: 9 }, (_, i) => ({
          ...keyframes()[0],
          timestampSeconds: Math.floor((duration / 10) * (i + 1)),
        })),
      )
      generator.generateKeyframes.mockResolvedValue(
        keyframeTargets(duration).map((timestampSeconds) => ({
          ...keyframes()[0],
          timestampSeconds,
        })),
      )
      await store.updateVideoThumbnails(id)
      const count = 9 + keyframeTargets(duration).length
      expect(store.getThumbnailJobDiagnostic(id)).toMatchObject({
        state: 'ready',
        completedFrames: count,
        totalFrames: count,
      })
      wrapper.unmount()
    },
  )
  test('satisfies motion with a distinct still fallback, preserves metadata, and skips regeneration on reopening', async () => {
    const { store, generator, thumbnails, wrapper } = setup()
    generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
    const items = Array.from({ length: 9 }, (_, i) => ({
      ...keyframes()[0],
      timestampSeconds: (i + 1) * 6,
    }))
    thumbnails.generateThumbnails.mockResolvedValue(items)
    await store.updateVideoThumbnails('v')
    expect(store.getPreviewProductState('v', 'motionClips')).toBe('fallback')
    expect(store.getPreviewProductState('v', 'keyframes')).toBe('ready')
    expect(store.getThumbnailJobState('v')).toBe('ready')
    expect(
      store.allVideos.find((v) => v.id === 'v')?.motionFallback,
    ).toMatchObject({
      version: MOTION_FALLBACK_VERSION,
      reason: 'unsupported',
      items,
    })
    expect(store.getThumbnailJobDiagnostic('v')?.failures).toEqual({
      motionClips: 'unsupported',
    })
    store.setVideoPreviewOpen('v', true)
    await store.updateVideoThumbnails('v')
    expect(generator.generateMotionClips).toHaveBeenCalledOnce()
    expect(thumbnails.generateThumbnails).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  test('hydrates cached fallback without retrying failed motion; seek work remains independent', async () => {
    const { store, generator, thumbnails, wrapper } = setup()
    const cached = video()
    cached.motionFallback = {
      version: MOTION_FALLBACK_VERSION,
      reason: 'unsupported',
      items: Array.from({ length: 9 }, (_, i) => ({
        ...keyframes()[0],
        timestampSeconds: (i + 1) * 6,
      })),
    }
    store.addVideos([cached])
    await store.updateVideoThumbnails('v')
    expect(generator.generateMotionClips).not.toHaveBeenCalled()
    expect(thumbnails.generateThumbnails).not.toHaveBeenCalled()
    expect(generator.generateKeyframes).toHaveBeenCalledOnce()
    expect(store.getPreviewProductState('v', 'motionClips')).toBe('fallback')
    wrapper.unmount()
  })
  test.each([false, true])(
    'reports separate ready products and active stage while seeks run (fallback=%s)',
    async (fallback) => {
      const { store, generator, thumbnails, mocks, global, wrapper } = setup()
      if (fallback) {
        generator.generateMotionClips.mockRejectedValue({
          reason: 'unsupported',
        })
        thumbnails.generateThumbnails.mockResolvedValue(
          Array.from({ length: 9 }, (_, i) => ({
            ...keyframes()[0],
            timestampSeconds: (i + 1) * 6,
          })),
        )
      }
      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
        'probably',
      )
      vi.mocked(mocks.useCases.addVideosUseCase.execute).mockImplementation(
        async function* () {
          yield {
            type: 'progress',
            progress: {
              total: 1,
              scanned: 1,
              existingCount: 0,
              newCount: 1,
              knownErrorCount: 0,
              createdCount: 1,
              failedCount: 0,
              completedCount: 1,
              phase: 'complete',
            },
          }
          yield { type: 'video', video: video() }
        },
      )
      let finishSeeks!: () => void
      generator.generateKeyframes.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          finishSeeks = resolve
        })
        return keyframes()
      })
      const toast = mount(IngestionStatusToast, { global })
      await store.addVideosFromFiles(
        createMockFileList(new File(['v'], 'v.mp4', { type: 'video/mp4' })),
      )
      const pending = store.updateVideoThumbnails('v')
      await flushPromises()
      expect(store.previewProductProgress).toMatchObject({
        motionClips: {
          ready: fallback ? 0 : 1,
          fallback: fallback ? 1 : 0,
          total: 1,
        },
        keyframes: { ready: 0, processing: 1, total: 1 },
      })
      expect(toast.text()).toContain(`Clips ready ${fallback ? 0 : 1} / 1`)
      if (fallback) expect(toast.text()).toContain('Still previews 1')
      expect(toast.text()).toContain('Seek thumbnails ready 0 / 1')
      expect(toast.text()).toContain('This import')
      expect(toast.text()).toContain('Active work across all videos')
      expect(toast.text()).toContain('Generating seek thumbnails')
      expect(store.getThumbnailJobState('v')).toBe('processing')
      expect(store.getThumbnailJobDiagnostic('v')?.error).toBeUndefined()
      expect(
        store.getThumbnailJobDiagnostic('v')?.completedAtMs,
      ).toBeUndefined()
      await toast.get('.ingestion-toast__close').trigger('click')
      expect(toast.find('.ingestion-toast').exists()).toBe(false)
      expect(store.getThumbnailJobState('v')).toBe('processing')
      expect(store.isPreviewProcessingPaused).toBe(false)
      finishSeeks()
      await pending
      await flushPromises()
      expect(store.previewProductProgress?.keyframes.ready).toBe(1)
      expect(store.getThumbnailJobState('v')).toBe('ready')
      expect(toast.find('.ingestion-toast').exists()).toBe(false)
      toast.unmount()
      wrapper.unmount()
    },
  )

  test('retains motion failure and cache warning across seek dispatch, then explicit retry only retries motion', async () => {
    const { store, generator, cache, wrapper } = setup()
    generator.generateMotionClips.mockRejectedValueOnce(
      Object.assign(new Error('no codec'), { reason: 'unsupported' }),
    )
    cache.putProduct.mockRejectedValueOnce(new Error('full'))
    await store.updateVideoThumbnails('v')
    expect(store.getThumbnailJobDiagnostic('v')).toMatchObject({
      state: 'failed',
      failures: { motionClips: 'unsupported' },
      cacheFailures: ['keyframes'],
    })
    store.setVideoPreviewOpen('v', true)
    await flushPromises()
    expect(generator.generateMotionClips).toHaveBeenCalledOnce()
    await store.updateVideoThumbnails('v')
    expect(generator.generateMotionClips).toHaveBeenCalledTimes(2)
    expect(generator.generateKeyframes).toHaveBeenCalledOnce()
    expect(store.getThumbnailJobState('v')).toBe('ready')
    wrapper.unmount()
  })

  test('generates clips for the whole 20-video batch before background seek thumbnails', async () => {
    const { store, generator, wrapper } = setup()
    const ids = Array.from({ length: 20 }, (_, i) => `video-${i}`)
    const order: string[] = []
    store.addVideos(ids.map(video))
    generator.generateMotionClips.mockImplementation(async (file) => {
      order.push(`clips:${file.name}`)
      return clips()
    })
    generator.generateKeyframes.mockImplementation(async (file) => {
      order.push(`seeks:${file.name}`)
      return keyframes()
    })
    store.setPreviewProcessingPaused(true)
    const pending = ids.map((id) => store.updateVideoThumbnails(id))
    store.setPreviewProcessingPaused(false)
    await Promise.all(pending)
    expect(order).toEqual([
      ...ids.map((id) => `clips:${id}.mp4`),
      ...ids.map((id) => `seeks:${id}.mp4`),
    ])
    expect(ids.map((id) => store.getThumbnailJobState(id))).toEqual(
      Array(20).fill('ready'),
    )
    wrapper.unmount()
  })

  test.each(['unchanged', 'close newest', 'reopen older'])(
    'with one worker, newest open video leads seeks only after all clips: %s',
    async (openChange) => {
      const { store, generator, wrapper } = setup()
      store.setThumbnailConcurrencyOverride(1)
      store.addVideos(['b', 'c'].map(video))
      const order: string[] = []
      let finishFirst!: () => void
      generator.generateMotionClips.mockImplementation(async (file) => {
        order.push(`clips:${file.name}`)
        if (file.name === 'v.mp4')
          await new Promise<void>((resolve) => {
            finishFirst = resolve
          })
        return clips()
      })
      generator.generateKeyframes.mockImplementation(async (file) => {
        order.push(`seeks:${file.name}`)
        return keyframes()
      })
      store.setPreviewProcessingPaused(true)
      const pending = ['v', 'b', 'c'].map((id) =>
        store.updateVideoThumbnails(id),
      )
      store.setPreviewProcessingPaused(false)
      await flushPromises()
      expect(order).toEqual(['clips:v.mp4'])
      store.setVideoPreviewOpen('b', true)
      store.setVideoPreviewOpen('c', true)
      store.setVideoPreviewOpen('b', true) // Repeated open is not a new opening.
      if (openChange === 'close newest') store.setVideoPreviewOpen('c', false)
      if (openChange === 'reopen older') {
        store.setVideoPreviewOpen('b', false)
        store.setVideoPreviewOpen('b', true)
      }
      await flushPromises()
      expect(order).toEqual(['clips:v.mp4'])
      finishFirst()
      await Promise.all(pending)
      expect(order).toEqual(
        openChange === 'close newest'
          ? [
              'clips:v.mp4',
              'clips:b.mp4',
              'clips:c.mp4',
              'seeks:b.mp4',
              'seeks:v.mp4',
              'seeks:c.mp4',
            ]
          : [
              'clips:v.mp4',
              'clips:b.mp4',
              'clips:c.mp4',
              ...(openChange === 'reopen older'
                ? ['seeks:b.mp4', 'seeks:c.mp4']
                : ['seeks:c.mp4', 'seeks:b.mp4']),
              'seeks:v.mp4',
            ],
      )
      expect(new Set(order).size).toBe(6)
      wrapper.unmount()
    },
  )

  test('Auto2 drains active clips before prioritized seeks without overlapping products for one video', async () => {
    const { store, generator, wrapper } = setup()
    store.addVideos(['b', 'c'].map(video))
    expect(store.thumbnailConcurrencyOverride).toBeNull()
    expect(store.effectiveThumbnailConcurrency).toBe(2)
    const active = new Map<string, () => void>()
    const order: string[] = []
    const holdProduct = async (file: File, kind: string) => {
      expect(active.has(file.name)).toBe(false)
      order.push(`${kind}:${file.name}`)
      await new Promise<void>((resolve) => {
        active.set(file.name, () => {
          active.delete(file.name)
          resolve()
        })
      })
    }
    generator.generateMotionClips.mockImplementation(async (file) => {
      await holdProduct(file, 'clips')
      return clips()
    })
    generator.generateKeyframes.mockImplementation(async (file) => {
      await holdProduct(file, 'seeks')
      return keyframes()
    })
    store.setPreviewProcessingPaused(true)
    const pending = ['v', 'b', 'c'].map((id) => store.updateVideoThumbnails(id))
    store.setPreviewProcessingPaused(false)
    await flushPromises()
    expect(order).toEqual(['clips:v.mp4', 'clips:b.mp4'])
    store.setVideoPreviewOpen('b', true)
    store.setVideoPreviewOpen('c', true)
    active.get('v.mp4')!()
    await flushPromises()
    expect(order.at(-1)).toBe('clips:c.mp4')
    expect(active.size).toBe(2)
    active.get('b.mp4')!()
    await flushPromises()
    expect(order).toEqual(['clips:v.mp4', 'clips:b.mp4', 'clips:c.mp4'])
    expect(active.size).toBe(1)
    expect(generator.generateKeyframes).not.toHaveBeenCalled()
    active.get('c.mp4')!()
    await flushPromises()
    expect(order.slice(-2)).toEqual(['seeks:c.mp4', 'seeks:b.mp4'])
    expect(active.size).toBe(2)
    active.get('b.mp4')!()
    await flushPromises()
    expect(order.at(-1)).toBe('seeks:v.mp4')
    active.get('c.mp4')!()
    active.get('v.mp4')!()
    await Promise.all(pending)
    expect(new Set(order).size).toBe(6)
    expect(active.size).toBe(0)
    wrapper.unmount()
  })

  test.each([false, true])(
    'waits for the last motion product cache write before seeks (fallback=%s)',
    async (fallback) => {
      const { store, generator, thumbnails, cache, wrapper } = setup()
      store.addVideos([video('b')])
      if (fallback) {
        generator.generateMotionClips.mockRejectedValue({
          reason: 'unsupported',
        })
        thumbnails.generateThumbnails.mockResolvedValue(
          Array.from({ length: 9 }, (_, i) => ({
            ...keyframes()[0],
            timestampSeconds: (i + 1) * 6,
          })),
        )
      }
      let finishSave!: () => void
      cache.putProduct.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve
          }),
      )
      store.setPreviewProcessingPaused(true)
      const pending = ['v', 'b'].map((id) => store.updateVideoThumbnails(id))
      store.setPreviewProcessingPaused(false)
      await flushPromises()
      try {
        expect(store.activePreviewProducts).toEqual([
          expect.objectContaining({
            product: 'motionClips',
            stage: fallback ? 'saving-fallback' : 'persisting',
          }),
        ])
        expect(generator.generateKeyframes).not.toHaveBeenCalled()
      } finally {
        finishSave()
        await Promise.all(pending)
        wrapper.unmount()
      }
      expect(generator.generateKeyframes).toHaveBeenCalledTimes(2)
      expect(store.getThumbnailJobState('v')).toBe('ready')
      expect(store.getThumbnailJobState('b')).toBe('ready')
    },
  )

  test('terminal motion failure does not block seeks after other clips finish', async () => {
    const { store, generator, wrapper } = setup()
    store.addVideos([video('b')])
    let finishClips!: () => void
    generator.generateMotionClips.mockImplementation(async (file) => {
      if (file.name === 'v.mp4') throw { reason: 'unsupported' }
      await new Promise<void>((resolve) => {
        finishClips = resolve
      })
      return clips()
    })
    store.setPreviewProcessingPaused(true)
    const pending = ['v', 'b'].map((id) => store.updateVideoThumbnails(id))
    store.setPreviewProcessingPaused(false)
    await flushPromises()
    store.setVideoPreviewOpen('v', true)
    await flushPromises()
    try {
      expect(store.getPreviewProductState('v', 'motionClips')).toBe('failed')
      expect(generator.generateKeyframes).not.toHaveBeenCalled()
    } finally {
      finishClips()
      await Promise.all(pending)
      wrapper.unmount()
    }
    expect(
      generator.generateKeyframes.mock.calls.map(([file]) => file.name),
    ).toEqual(['v.mp4', 'b.mp4'])
    expect(store.getPreviewProductState('v', 'keyframes')).toBe('ready')
    expect(store.getThumbnailJobState('v')).toBe('failed')
    expect(store.getThumbnailJobState('b')).toBe('ready')
  })

  test('queue warmup and player priority changes do not cancel an already-running seek', async () => {
    const { store, generator, wrapper } = setup()
    store.setThumbnailConcurrencyOverride(1)
    const order: string[] = []
    let finishSeeks!: () => void
    let seekSignal!: AbortSignal
    generator.generateMotionClips.mockImplementation(async (file) => {
      order.push(`clips:${file.name}`)
      return clips()
    })
    generator.generateKeyframes.mockImplementation(async (file, options) => {
      order.push(`seeks:${file.name}`)
      if (file.name === 'v.mp4') {
        seekSignal = options.signal
        await new Promise<void>((resolve) => {
          finishSeeks = resolve
        })
      }
      return keyframes()
    })
    const first = store.updateVideoThumbnails('v')
    await flushPromises()
    store.setVideoPreviewOpen('v', true)
    store.setVideoPreviewOpen('v', false)
    store.addVideos([video('b')])
    const second = store.updateVideoThumbnails('b')
    await flushPromises()
    expect(order).toEqual(['clips:v.mp4', 'seeks:v.mp4'])
    expect(seekSignal.aborted).toBe(false)
    finishSeeks()
    await Promise.all([first, second])
    expect(order).toEqual([
      'clips:v.mp4',
      'seeks:v.mp4',
      'clips:b.mp4',
      'seeks:b.mp4',
    ])
    wrapper.unmount()
  })

  test('reports the worker preview backend and product failures without fabricated phase timings', async () => {
    const { store, generator, cache, mocks, wrapper } = setup()
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    vi.mocked(mocks.useCases.addVideosUseCase.execute).mockImplementation(
      async function* () {
        yield { type: 'video', video: video() }
      },
    )
    generator.generateKeyframes.mockRejectedValue(new Error('decode failed'))
    cache.putProduct.mockRejectedValue(new Error('cache failed'))
    await store.addVideosFromFiles(
      createMockFileList(new File(['v'], 'v.mp4', { type: 'video/mp4' })),
    )
    await store.updateVideoThumbnails('v')
    const report = store.createIngestionRunReport('ingestion-1')!
    expect(report.measurements).toMatchObject({
      backend: 'mediabunny',
      workersEnabled: true,
      previewPhaseTimingsAvailable: false,
      previews: {},
    })
    expect(report.backgroundPreviews).toMatchObject({
      productFailures: ['keyframes:generation-failed'],
      cacheFailures: ['motionClips'],
    })
    wrapper.unmount()
  })
  test('does not enqueue hover or explicit preview work while wiping', async () => {
    const { store, generator, mocks, wrapper } = setup()
    let finish = () => {}
    vi.mocked(mocks.useCases.wipeVideoDataUseCase.execute).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const wiping = store.wipeVideoData()
    store.requestThumbnailWarmup('v')
    const settled = vi.fn()
    const pending = store.updateVideoThumbnails('v').then(settled)
    await flushPromises()
    expect(settled).toHaveBeenCalledOnce()
    expect(store.getThumbnailJobState('v')).toBeUndefined()
    finish()
    await wiping
    await pending
    expect(generator.generateMotionClips).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  test('upgrades nine legacy stills using both independent products', async () => {
    const { store, generator, wrapper } = setup()
    await store.updateVideoThumbnails('v')
    expect(generator.generateMotionClips).toHaveBeenCalledOnce()
    expect(store.allVideos[0].motionClips).toHaveLength(10)
    expect(store.allVideos[0].keyframes).toHaveLength(4)
    expect(store.getThumbnailJobState('v')).toBe('ready')
    wrapper.unmount()
  })

  test('retains clips on keyframe failure and does not retry failed work on hover', async () => {
    const { store, generator, wrapper } = setup()
    generator.generateKeyframes.mockRejectedValue(new Error('decode failed'))
    await store.updateVideoThumbnails('v')
    expect(store.allVideos[0].motionClips).toHaveLength(10)
    expect(store.getThumbnailJobDiagnostic('v')).toMatchObject({
      state: 'failed',
      failures: { keyframes: 'generation-failed' },
    })
    store.requestThumbnailWarmup('v')
    await flushPromises()
    expect(generator.generateKeyframes).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  test('focus resume retains uncached completed clips and only regenerates keyframes', async () => {
    const { store, generator, cache, wrapper } = setup()
    cache.putProduct.mockRejectedValue(
      new DOMException('Full', 'QuotaExceededError'),
    )
    let started = false
    generator.generateKeyframes.mockImplementationOnce(
      (_file, { signal }) =>
        new Promise((_resolve, reject) => {
          started = true
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Paused', 'AbortError')),
            { once: true },
          )
        }),
    )
    const settled = vi.fn()
    const pending = store.updateVideoThumbnails('v').then(settled)
    await flushPromises()
    expect(started).toBe(true)
    expect(store.allVideos[0].motionClips).toHaveLength(10)
    store.togglePinVideo('v')
    store.allVideos[0].votes = 7
    store.setPreviewProcessingPaused(true)
    await flushPromises()
    expect(store.getThumbnailJobState('v')).toBe('queued')
    expect(settled).not.toHaveBeenCalled()
    expect(generator.generateKeyframes).toHaveBeenCalledOnce()
    store.setPreviewProcessingPaused(false)
    store.setPreviewProcessingPaused(false)
    await pending
    expect(generator.generateMotionClips).toHaveBeenCalledOnce()
    expect(generator.generateKeyframes).toHaveBeenCalledTimes(2)
    expect(store.allVideos[0]).toMatchObject({
      pinned: true,
      votes: 7,
      url: 'blob:original',
      previewVersions: {
        motionClips: MOTION_PREVIEW_VERSION,
        keyframes: KEYFRAME_PREVIEW_VERSION,
      },
    })
    expect(store.getThumbnailJobDiagnostic('v')?.cacheFailures).toContain(
      'keyframes',
    )
    wrapper.unmount()
  })

  test('reselection only hydrates missing products and preserves newer in-session clips', () => {
    const { store, wrapper } = setup()
    const currentClips = clips()
    store.allVideos[0].motionClips = currentClips
    store.allVideos[0].previewVersions = { motionClips: MOTION_PREVIEW_VERSION }
    store.togglePinVideo('v')
    store.addVideos([
      {
        ...video(),
        motionClips: clips(),
        keyframes: keyframes(),
        previewVersions: {
          motionClips: MOTION_PREVIEW_VERSION,
          keyframes: KEYFRAME_PREVIEW_VERSION,
        },
      },
    ])
    expect(toRaw(store.allVideos[0].motionClips[0].blob)).toBe(
      currentClips[0].blob,
    )
    expect(store.allVideos[0].keyframes).toHaveLength(4)
    expect(store.allVideos[0].pinned).toBe(true)
    wrapper.unmount()
  })

  test('retires a paused queued promise when reselecting supplies complete cached products and the player opens', async () => {
    const { store, generator, wrapper } = setup()
    store.setPreviewProcessingPaused(true)
    const settled = vi.fn()
    const pending = store.updateVideoThumbnails('v').then(settled)
    store.addVideos([
      {
        ...video(),
        motionClips: clips(),
        keyframes: keyframes(),
        previewVersions: {
          motionClips: MOTION_PREVIEW_VERSION,
          keyframes: KEYFRAME_PREVIEW_VERSION,
        },
      },
    ])
    store.setVideoPreviewOpen('v', true)
    store.setPreviewProcessingPaused(false)
    await flushPromises()
    expect(settled).toHaveBeenCalledOnce()
    await pending
    expect(store.getThumbnailJobState('v')).toBe('ready')
    expect(generator.generateMotionClips).not.toHaveBeenCalled()
    expect(generator.generateKeyframes).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  test('opening a fully published video does not retire its still-active cache write', async () => {
    const { store, cache, wrapper } = setup()
    let finishSave!: () => void
    cache.putProduct
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve
          }),
      )
    const settled = vi.fn()
    const pending = store.updateVideoThumbnails('v').then(settled)
    await flushPromises()
    expect(store.allVideos[0].keyframes).toHaveLength(4)
    store.setVideoPreviewOpen('v', true)
    await flushPromises()
    expect(store.getThumbnailJobState('v')).toBe('processing')
    expect(store.activePreviewProducts[0]?.stage).toBe('persisting')
    expect(settled).not.toHaveBeenCalled()
    finishSave()
    await pending
    expect(store.getThumbnailJobState('v')).toBe('ready')
    wrapper.unmount()
  })

  test('opening a ready video retains its cache warnings and completed diagnostic', async () => {
    const { store, cache, wrapper } = setup()
    cache.putProduct.mockRejectedValue(new Error('cache full'))
    await store.updateVideoThumbnails('v')
    const diagnostic = { ...store.getThumbnailJobDiagnostic('v') }
    expect(diagnostic.cacheFailures).toEqual(['motionClips', 'keyframes'])
    store.setVideoPreviewOpen('v', true)
    expect(store.getThumbnailJobDiagnostic('v')).toEqual(diagnostic)
    wrapper.unmount()
  })

  test('late per-product callbacks cannot publish into a replacement same-ID card', async () => {
    const context = createPresentationTestContext()
    let publish: PreviewEnrichmentOptions['onProduct']
    let finish: () => void = () => {}
    context.global.provide[UPDATE_PREVIEWS_USE_CASE_KEY as symbol] = {
      execute: (_video: unknown, options: PreviewEnrichmentOptions) =>
        new Promise((resolve) => {
          publish = options.onProduct
          finish = () =>
            resolve({ video: video(), failures: {}, cacheFailures: [] })
        }),
    }
    const wrapper = mount(Harness, { global: context.global })
    const store = useVideoStore()
    store.addVideos([video()])
    const pending = store.updateVideoThumbnails('v')
    expect(publish).toBeTypeOf('function')
    store.removeVideo('v')
    store.addVideos([video()])
    publish?.({
      kind: 'motionClips',
      version: MOTION_PREVIEW_VERSION,
      items: clips(),
    } satisfies VideoPreviewProduct)
    finish()
    await pending
    await flushPromises()
    expect(store.allVideos[0].motionClips).toEqual([])
    wrapper.unmount()
  })

  test('wipe aborts active work before clearing storage and prevents focus resurrection', async () => {
    const { store, generator, mocks, wrapper } = setup()
    let signal: AbortSignal | undefined
    generator.generateKeyframes.mockImplementationOnce(
      (_file, options) =>
        new Promise((_resolve, reject) => {
          signal = options.signal
          signal.addEventListener('abort', () =>
            reject(new DOMException('Wiped', 'AbortError')),
          )
        }),
    )
    const pending = store.updateVideoThumbnails('v')
    await flushPromises()
    vi.mocked(mocks.useCases.wipeVideoDataUseCase.execute).mockImplementation(
      async () => {
        expect(signal?.aborted).toBe(true)
      },
    )
    await store.wipeVideoData()
    await pending
    store.setPreviewProcessingPaused(false)
    await flushPromises()
    expect(store.allVideos).toEqual([])
    expect(generator.generateKeyframes).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
