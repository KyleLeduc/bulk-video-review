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
} from '@domain/services/videoPreviewPolicy'
import {
  buildParsedVideo,
  createPresentationTestContext,
  createMockFileList,
} from '@test-utils/index'
import { UPDATE_PREVIEWS_USE_CASE_KEY } from '@presentation/di/injectionKeys'
import { useVideoStore } from './videosStore'

const Harness = defineComponent({
  setup: () => ({ store: useVideoStore() }),
  template: '<div />',
})
const video = () =>
  buildParsedVideo({
    id: 'v',
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
  const file = new File(['v'], 'v.mp4', { type: 'video/mp4' })
  const context = createPresentationTestContext({
    sessionRegistry: { getFile: vi.fn(() => file) },
  })
  const generator = {
    generateMotionClips: vi.fn(async () => clips()),
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
  const useCase = new UpdateVideoPreviewsUseCase(
    generator,
    { getVideo: vi.fn(async () => video()) },
    context.mocks.sessionRegistry,
    cache,
    context.mocks.logger,
  )
  context.global.provide[UPDATE_PREVIEWS_USE_CASE_KEY as symbol] = useCase
  const wrapper = mount(Harness, { global: context.global })
  const store = useVideoStore()
  store.addVideos([video()])
  return { ...context, wrapper, store, generator, cache }
}
afterEach(() => vi.restoreAllMocks())

describe('motion preview queue integration', () => {
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
