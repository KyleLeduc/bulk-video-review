import { describe, expect, test, vi } from 'vitest'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import type {
  IVideoIngestionFailureTracker,
  IVideoMetadataExtractor,
} from '@app/ports'
import {
  buildLogger,
  buildSessionRegistry,
  buildVideoAggregate,
} from '@test-utils/index'
import { LinearVideoIngestionUseCase } from './LinearVideoIngestionUseCase'
import {
  KEYFRAME_PREVIEW_VERSION,
  MOTION_FALLBACK_VERSION,
} from '@domain/services/videoPreviewPolicy'

describe('LinearVideoIngestionUseCase preview hydration', () => {
  test.each([false, true])(
    'hydrates new products nonfatally while registering the original file (cache fails=%s)',
    async (cacheFails) => {
      const file = new File(['mp4'], 'cached.mp4')
      const aggregate = buildVideoAggregate({
        id: 'cached-id',
        duration: 10,
        votes: 4,
      })
      const keyframes = [
        {
          timestampSeconds: 0,
          width: 160,
          height: 90,
          blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        },
      ]
      const previewCache = {
        epoch: 0,
        getProducts: vi.fn(async () => {
          if (cacheFails) throw new Error('cache unavailable')
          return {
            motionClips: [],
            motionFallback: {
              version: MOTION_FALLBACK_VERSION,
              reason: 'unsupported',
              items: Array.from({ length: 9 }, (_, i) => ({
                ...keyframes[0],
                timestampSeconds: i + 1,
              })),
            },
            keyframes,
            previewVersions: { keyframes: KEYFRAME_PREVIEW_VERSION },
          }
        }),
        putProduct: vi.fn(),
        clear: vi.fn(),
      }
      const registry = buildSessionRegistry()
      const logger = buildLogger()
      const useCase = new LinearVideoIngestionUseCase(
        { generateId: vi.fn(async () => 'cached-id'), extract: vi.fn() },
        {
          getVideo: vi.fn(async () => aggregate),
        } as unknown as IVideoAggregateRepository,
        registry,
        logger,
        { hasFailure: vi.fn(), recordFailure: vi.fn(), clearFailure: vi.fn() },
        undefined,
        previewCache,
      )
      const videos = []
      for await (const event of useCase.execute([{ file }]))
        if (event.type === 'video') videos.push(event.video)
      expect(videos).toHaveLength(1)
      expect(videos[0]).toMatchObject({
        votes: 4,
        keyframes: cacheFails ? [] : keyframes,
      })
      expect(registry.registerFile).toHaveBeenCalledWith('cached-id', file)
      expect(videos[0].motionFallback?.items.length).toBe(
        cacheFails ? undefined : 9,
      )
      expect(previewCache.getProducts).toHaveBeenCalledWith('cached-id', 10)
      if (cacheFails) expect(logger.warn).toHaveBeenCalled()
    },
  )
  test('hydrates persisted preview frames for a cached video', async () => {
    const file = new File(['video-bytes'], 'cached.mp4', {
      type: 'video/mp4',
    })
    const previewFrames = [
      {
        timestampSeconds: 4,
        blob: new Blob(['preview'], { type: 'image/jpeg' }),
        width: 480,
        height: 270,
      },
    ]
    const metadataExtractor: IVideoMetadataExtractor = {
      generateId: vi.fn(async () => 'cached-id'),
      extract: vi.fn(async () => null),
    }
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () =>
        buildVideoAggregate({ id: 'cached-id', title: 'cached.mp4' }),
      ),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => video),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const failureTracker: IVideoIngestionFailureTracker = {
      hasFailure: vi.fn(async () => false),
      recordFailure: vi.fn(async () => {}),
      clearFailure: vi.fn(async () => {}),
    }
    const previewRepository: IVideoPreviewRepository = {
      getFrames: vi.fn(async () => previewFrames),
      replaceFrames: vi.fn(async () => {}),
      deleteFrames: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    }
    const useCase = new LinearVideoIngestionUseCase(
      metadataExtractor,
      aggregateRepository,
      buildSessionRegistry(),
      buildLogger(),
      failureTracker,
      previewRepository,
    )

    const videos = []
    for await (const event of useCase.execute([{ file }])) {
      if (event.type === 'video') {
        videos.push(event.video)
      }
    }

    expect(previewRepository.getFrames).toHaveBeenCalledWith('cached-id')
    expect(videos).toHaveLength(1)
    expect(videos[0]?.previewFrames).toEqual(previewFrames)
  })

  test('keeps a cached video when optional preview hydration fails', async () => {
    const file = new File(['video-bytes'], 'cached.mp4', {
      type: 'video/mp4',
    })
    const previewError = new Error('preview cache unavailable')
    const metadataExtractor: IVideoMetadataExtractor = {
      generateId: vi.fn(async () => 'cached-id'),
      extract: vi.fn(async () => null),
    }
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () =>
        buildVideoAggregate({ id: 'cached-id', title: 'cached.mp4' }),
      ),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => video),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const failureTracker: IVideoIngestionFailureTracker = {
      hasFailure: vi.fn(async () => false),
      recordFailure: vi.fn(async () => {}),
      clearFailure: vi.fn(async () => {}),
    }
    const previewRepository: IVideoPreviewRepository = {
      getFrames: vi.fn(async () => {
        throw previewError
      }),
      replaceFrames: vi.fn(async () => {}),
      deleteFrames: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    }
    const sessionRegistry = buildSessionRegistry()
    const logger = buildLogger()
    const useCase = new LinearVideoIngestionUseCase(
      metadataExtractor,
      aggregateRepository,
      sessionRegistry,
      logger,
      failureTracker,
      previewRepository,
    )

    const videos = []
    for await (const event of useCase.execute([{ file }])) {
      if (event.type === 'video') {
        videos.push(event.video)
      }
    }

    expect(videos).toHaveLength(1)
    expect(videos[0]?.previewFrames).toEqual([])
    expect(sessionRegistry.registerFile).toHaveBeenCalledWith('cached-id', file)
    expect(logger.warn).toHaveBeenCalledWith(
      '[linear-ingestion] cached-preview:hydrate:failed',
      expect.objectContaining({ id: 'cached-id', error: previewError }),
    )
  })
})
