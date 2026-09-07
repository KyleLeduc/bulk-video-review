import { expect, it, vi } from 'vitest'
import {
  buildLogger,
  buildParsedVideo,
  buildSessionRegistry,
} from '@test-utils/index'
import {
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  MOTION_FALLBACK_VERSION,
} from '@domain/services/videoPreviewPolicy'
import type { VideoPreviewProduct } from '@domain/repositories/IVideoPreviewCacheRepository'
import { UpdateVideoPreviewsUseCase } from './UpdateVideoPreviewsUseCase'
import { VideoSessionRegistry } from '@infra/video/services/VideoSessionRegistry'

function setup() {
  const file = new File(['mp4'], 'original.mp4')
  const video = buildParsedVideo({ duration: 3, votes: 5, pinned: true })
  const motionClips = [
    {
      timestampSeconds: 0,
      durationSeconds: 1.5,
      width: 320,
      height: 180,
      blob: new Blob(['mp4'], { type: 'video/mp4' }),
    },
  ]
  const keyframes = [
    {
      timestampSeconds: 0,
      width: 160,
      height: 90,
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    },
  ]
  const generator = {
    generateMotionClips: vi.fn(async () => motionClips),
    generateKeyframes: vi.fn(async () => keyframes),
  }
  const cache = {
    epoch: 0,
    getProducts: vi.fn(),
    putProduct: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  }
  const repository = { getVideo: vi.fn(async () => video) }
  const registry = buildSessionRegistry({
    getFile: vi.fn(() => file),
    acquireObjectUrl: vi.fn(() => 'blob:original'),
  })
  const logger = buildLogger()
  const stills = Array.from({ length: 9 }, (_, i) => ({
    ...keyframes[0],
    timestampSeconds: Math.floor((video.duration / 10) * (i + 1)),
  }))
  const thumbnails = { generateThumbnails: vi.fn(async () => stills) }
  const useCase = new UpdateVideoPreviewsUseCase(
    generator,
    repository,
    registry,
    cache,
    logger,
    thumbnails,
  )
  const onProduct = vi.fn((product: VideoPreviewProduct) => {
    if (product.kind === 'motionFallback') {
      video.motionFallback = product
      return
    }
    if (product.kind === 'motionClips') video.motionClips = product.items
    else video.keyframes = product.items
    video.previewVersions[product.kind] = product.version
  })
  return {
    video,
    motionClips,
    keyframes,
    generator,
    cache,
    repository,
    registry,
    useCase,
    onProduct,
    logger,
    thumbnails,
    stills,
  }
}

it('publishes and caches each complete product independently without changing review metadata', async () => {
  const s = setup()
  const result = await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(result.failures).toEqual({})
  expect(s.thumbnails.generateThumbnails).not.toHaveBeenCalled()
  expect(result.video).toMatchObject({
    votes: 5,
    pinned: true,
    motionClips: s.motionClips,
    keyframes: s.keyframes,
    previewVersions: {
      motionClips: MOTION_PREVIEW_VERSION,
      keyframes: KEYFRAME_PREVIEW_VERSION,
    },
  })
  expect(
    s.cache.putProduct.mock.calls.map((call) => (call as unknown[])[2]),
  ).toEqual([
    {
      kind: 'motionClips',
      version: MOTION_PREVIEW_VERSION,
      items: s.motionClips,
    },
    {
      kind: 'keyframes',
      version: KEYFRAME_PREVIEW_VERSION,
      items: s.keyframes,
    },
  ])
})
it('generates only the requested product so the scheduler can yield between products', async () => {
  const s = setup()
  const result = await s.useCase.execute(s.video, {
    product: 'keyframes',
    onProduct: s.onProduct,
  })
  expect(s.generator.generateMotionClips).not.toHaveBeenCalled()
  expect(s.generator.generateKeyframes).toHaveBeenCalledOnce()
  expect(result.video.keyframes).toEqual(s.keyframes)
  expect(result.video.motionClips).toEqual([])
  expect(s.cache.putProduct).toHaveBeenCalledOnce()
  expect(result.failures).toEqual({})
})
it('retains completed motion even when cache fails and keyframes abort; resume only generates missing keyframes', async () => {
  const s = setup()
  s.cache.putProduct.mockRejectedValue(
    new DOMException('quota', 'QuotaExceededError'),
  )
  const controller = new AbortController()
  s.generator.generateKeyframes.mockImplementationOnce(async () => {
    controller.abort()
    throw new DOMException('paused', 'AbortError')
  })
  await expect(
    s.useCase.execute(s.video, {
      signal: controller.signal,
      onProduct: s.onProduct,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(s.video.motionClips).toEqual(s.motionClips)
  expect(s.video.previewVersions.motionClips).toBe(MOTION_PREVIEW_VERSION)
  expect(s.video.keyframes).toEqual([])
  expect(s.logger.warn).toHaveBeenCalled()
  await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(s.generator.generateMotionClips).toHaveBeenCalledOnce()
  expect(s.generator.generateKeyframes).toHaveBeenCalledTimes(2)
})
it('falls back to complete stills after unsupported motion and continues to keyframes', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue(
    Object.assign(new Error('private'), { reason: 'unsupported' }),
  )
  const result = await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(result.failures).toEqual({ motionClips: 'unsupported' })
  expect(s.onProduct).toHaveBeenCalledTimes(2)
  expect(result.video.motionFallback).toMatchObject({
    version: MOTION_FALLBACK_VERSION,
    reason: 'unsupported',
    items: s.stills,
  })
  expect(s.thumbnails.generateThumbnails).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ count: 10, maxWidth: 320 }),
  )
  expect(s.registry.releaseObjectUrl).toHaveBeenCalledOnce()
  expect(s.video.keyframes).toEqual(s.keyframes)
  await s.useCase.execute(s.video)
  expect(s.generator.generateMotionClips).toHaveBeenCalledOnce()
  expect(s.thumbnails.generateThumbnails).toHaveBeenCalledOnce()
})
it('reuses validated existing stills only after a failed motion attempt', async () => {
  const s = setup()
  s.video.previewFrames = s.stills
  s.generator.generateMotionClips.mockResolvedValue([])
  const result = await s.useCase.execute(s.video)
  expect(result.video.motionFallback?.items).toEqual(s.stills)
  expect(result.failures).toEqual({ motionClips: 'output-invalid' })
  expect(s.generator.generateMotionClips).toHaveBeenCalledOnce()
  expect(s.thumbnails.generateThumbnails).not.toHaveBeenCalled()
})
it('retains the cover and continues seeks when both extraction paths fail', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue(new Error('private path'))
  s.thumbnails.generateThumbnails.mockResolvedValue(s.stills.slice(0, 4))
  const result = await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(result.failures).toEqual({
    motionClips: 'generation-failed',
    motionFallback: 'output-invalid',
  })
  expect(result.video.motionFallback).toBeUndefined()
  expect(result.video.thumb).toBe(s.video.thumb)
  expect(result.video.keyframes).toEqual(s.keyframes)
})
it('retains the live fallback and original failure when optional persistence fails', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
  s.cache.putProduct.mockRejectedValue(new Error('quota'))
  const result = await s.useCase.execute(s.video, {
    product: 'motionClips',
    onProduct: s.onProduct,
  })
  expect(s.video.motionFallback?.items).toEqual(s.stills)
  expect(result.failures).toEqual({ motionClips: 'unsupported' })
  expect(result.cacheFailures).toEqual(['motionFallback'])
})
it.each(['removed', 'reselected', 'wiped', 'aborted'] as const)(
  'does not publish or persist stale %s fallback work',
  async (cause) => {
    const s = setup()
    const controller = new AbortController()
    s.generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
    s.thumbnails.generateThumbnails.mockImplementationOnce(async () => {
      if (cause === 'removed')
        s.repository.getVideo.mockResolvedValue(undefined as never)
      if (cause === 'reselected')
        vi.mocked(s.registry.getFile).mockReturnValue(
          new File(['other'], 'other.mp4'),
        )
      if (cause === 'wiped') s.cache.epoch++
      if (cause === 'aborted') controller.abort()
      return s.stills
    })
    await expect(
      s.useCase.execute(s.video, {
        signal: controller.signal,
        onProduct: s.onProduct,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(s.onProduct).not.toHaveBeenCalled()
    expect(s.cache.putProduct).not.toHaveBeenCalled()
    expect(s.registry.releaseObjectUrl).toHaveBeenCalledOnce()
  },
)
it('never falls back on a cancelled motion attempt', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue(
    new DOMException('paused', 'AbortError'),
  )
  await expect(s.useCase.execute(s.video)).rejects.toMatchObject({
    name: 'AbortError',
  })
  expect(s.thumbnails.generateThumbnails).not.toHaveBeenCalled()
})
it('stale DOM cleanup cannot release a replacement player URL', async () => {
  const s = setup()
  const registry = new VideoSessionRegistry()
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:old')
    .mockReturnValueOnce('blob:new')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  try {
    registry.registerFile(s.video.id, new File(['old'], 'old.mp4'))
    s.generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
    s.thumbnails.generateThumbnails.mockImplementationOnce(async () => {
      registry.unregisterFile(s.video.id)
      registry.registerFile(s.video.id, new File(['new'], 'new.mp4'))
      expect(registry.acquireObjectUrl(s.video.id)).toBe('blob:new')
      return s.stills
    })
    const useCase = new UpdateVideoPreviewsUseCase(
      s.generator,
      s.repository,
      registry,
      s.cache,
      s.logger,
      s.thumbnails,
    )
    await expect(useCase.execute(s.video)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:old')
    registry.releaseObjectUrl(s.video.id)
    expect(revoke).toHaveBeenLastCalledWith('blob:new')
  } finally {
    create.mockRestore()
    revoke.mockRestore()
  }
})
it('reports saving nine stills rather than saving the clip recipe', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue({ reason: 'unsupported' })
  const onProgress = vi.fn()
  await s.useCase.execute(s.video, { product: 'motionClips', onProgress })
  expect(onProgress).toHaveBeenLastCalledWith({
    kind: 'motionClips',
    stage: 'saving-fallback',
    completed: 9,
    total: 9,
  })
})
it.each(['removed', 'reselected', 'wiped', 'aborted'] as const)(
  'does not publish or persist stale %s work',
  async (cause) => {
    const s = setup()
    const controller = new AbortController()
    s.generator.generateMotionClips.mockImplementationOnce(async () => {
      if (cause === 'removed')
        s.repository.getVideo.mockResolvedValue(undefined as never)
      if (cause === 'reselected')
        vi.mocked(s.registry.getFile).mockReturnValue(
          new File(['other'], 'other.mp4'),
        )
      if (cause === 'wiped') s.cache.epoch++
      if (cause === 'aborted') controller.abort()
      return s.motionClips
    })
    await expect(
      s.useCase.execute(s.video, {
        signal: controller.signal,
        onProduct: s.onProduct,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(s.onProduct).not.toHaveBeenCalled()
    expect(s.cache.putProduct).not.toHaveBeenCalled()
  },
)
it('does not extract without an original session file', async () => {
  const s = setup()
  vi.mocked(s.registry.getFile).mockReturnValue(null)
  const result = await s.useCase.execute(s.video)
  expect(result.failures).toEqual({
    motionClips: 'missing-source',
    keyframes: 'missing-source',
  })
  expect(s.generator.generateMotionClips).not.toHaveBeenCalled()
})
