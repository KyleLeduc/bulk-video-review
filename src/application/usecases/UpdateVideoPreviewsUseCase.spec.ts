import { expect, it, vi } from 'vitest'
import {
  buildLogger,
  buildParsedVideo,
  buildSessionRegistry,
} from '@test-utils/index'
import {
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
} from '@domain/services/videoPreviewPolicy'
import type { VideoPreviewProduct } from '@domain/repositories/IVideoPreviewCacheRepository'
import { UpdateVideoPreviewsUseCase } from './UpdateVideoPreviewsUseCase'

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
  const registry = buildSessionRegistry({ getFile: vi.fn(() => file) })
  const logger = buildLogger()
  const useCase = new UpdateVideoPreviewsUseCase(
    generator,
    repository,
    registry,
    cache,
    logger,
  )
  const onProduct = vi.fn((product: VideoPreviewProduct) => {
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
  }
}

it('publishes and caches each complete product independently without changing review metadata', async () => {
  const s = setup()
  const result = await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(result.failures).toEqual({})
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
it('continues to keyframes after unsupported motion, but never publishes partial products', async () => {
  const s = setup()
  s.generator.generateMotionClips.mockRejectedValue(
    Object.assign(new Error('private'), { reason: 'unsupported' }),
  )
  const result = await s.useCase.execute(s.video, { onProduct: s.onProduct })
  expect(result.failures).toEqual({ motionClips: 'unsupported' })
  expect(s.onProduct).toHaveBeenCalledOnce()
  expect(s.video.keyframes).toEqual(s.keyframes)
  s.generator.generateMotionClips.mockResolvedValue([])
  expect((await s.useCase.execute(s.video)).failures).toEqual({
    motionClips: 'output-invalid',
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
