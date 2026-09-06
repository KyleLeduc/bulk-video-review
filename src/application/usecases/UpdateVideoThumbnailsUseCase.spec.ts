import { describe, expect, test, vi } from 'vitest'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import type {
  IEventPublisher,
  IVideoSessionRegistry,
  IVideoThumbnailGenerator,
} from '@app/ports'
import {
  buildParsedVideo,
  buildSessionRegistry,
  buildVideoAggregate,
} from '@test-utils/index'
import { UpdateVideoThumbnailsUseCase } from './UpdateVideoThumbnailsUseCase'

const previewFrames = Array.from({ length: 9 }, (_, index) => ({
  timestampSeconds: (index + 1) * 10,
  blob: new Blob([`frame-${index}`], { type: 'image/jpeg' }),
  width: 480,
  height: 270,
}))

const buildPreviewRepository = (): IVideoPreviewRepository => ({
  getFrames: vi.fn(async () => []),
  replaceFrames: vi.fn(async () => {}),
  deleteFrames: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
})

describe('UpdateVideoThumbnailsUseCase', () => {
  test.each(['completed', 'failed', 'aborted'] as const)(
    'measures awaited preview persistence through %s',
    async (outcome) => {
      let clockMs = 0
      const clock = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => clockMs)
      const aggregate = buildVideoAggregate()
      const repository: IVideoAggregateRepository = {
        getVideo: async () => {
          clockMs += 3
          return aggregate
        },
        updateVideo: async (video) => {
          clockMs += 7
          return video
        },
        getAllVideos: async () => [],
        postVideo: async (video) => ({ ...video, votes: 0 }),
        updateVotes: async () => null,
        wipeData: async () => {},
      }
      const previews = buildPreviewRepository()
      const error = new DOMException(
        'write failed',
        outcome === 'aborted' ? 'AbortError' : 'Error',
      )
      previews.replaceFrames = async () => {
        clockMs += 5
        if (outcome !== 'completed') throw error
      }
      const publisher = {
        publish: async () => {
          clockMs += 100
        },
        publishBatch: async () => {},
      }
      const onTiming = vi.fn()
      const useCase = new UpdateVideoThumbnailsUseCase(
        {
          generateThumbnails: async (_url, options) => {
            options?.onTiming?.({
              phase: 'encode',
              durationMs: 2,
              outcome: 'completed',
            })
            return previewFrames
          },
        },
        repository,
        buildSessionRegistry(),
        publisher,
        previews,
      )
      try {
        const result = useCase.execute(
          buildParsedVideo({ url: 'blob:video' }),
          { onTiming },
        )
        if (outcome === 'completed')
          await expect(result).resolves.toMatchObject({ previewFrames })
        else await expect(result).rejects.toBe(error)
        expect(onTiming.mock.calls).toEqual([
          [{ phase: 'encode', durationMs: 2, outcome: 'completed' }],
          [{ phase: 'persistence', durationMs: 3, outcome: 'completed' }],
          [{ phase: 'persistence', durationMs: 5, outcome }],
          ...(outcome === 'completed'
            ? [[{ phase: 'persistence', durationMs: 7, outcome }]]
            : []),
        ])
      } finally {
        clock.mockRestore()
      }
    },
  )

  test.each(['entry', 'lookup', 'progress', 'frames', 'aggregate'] as const)(
    'does not publish stale completion when cancelled during %s',
    async (stage) => {
      const controller = new AbortController()
      const aggregateRepository: IVideoAggregateRepository = {
        getVideo: vi.fn(async () => {
          if (stage === 'lookup') controller.abort()
          return buildVideoAggregate({ id: 'id-1' })
        }),
        getAllVideos: vi.fn(async () => []),
        postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
        updateVideo: vi.fn(async (video) => {
          if (stage === 'aggregate') controller.abort()
          return buildVideoAggregate(video)
        }),
        updateVotes: vi.fn(async () => null),
        wipeData: vi.fn(async () => {}),
      }
      const previewRepository = buildPreviewRepository()
      previewRepository.replaceFrames = vi.fn(async () => {
        if (stage === 'frames') controller.abort()
      })
      const thumbnailGenerator = {
        generateThumbnails: vi.fn(async () => previewFrames),
      }
      const eventPublisher = {
        publish: vi.fn(async () => {}),
        publishBatch: vi.fn(async () => {}),
      }
      const useCase = new UpdateVideoThumbnailsUseCase(
        thumbnailGenerator,
        aggregateRepository,
        buildSessionRegistry(),
        eventPublisher,
        previewRepository,
      )
      if (stage === 'entry') controller.abort()

      await expect(
        useCase.execute(buildParsedVideo({ url: 'blob:video' }), {
          signal: controller.signal,
          onProgress: () => {
            if (stage === 'progress') controller.abort()
          },
        }),
      ).rejects.toMatchObject({ name: 'AbortError' })

      expect(eventPublisher.publish).not.toHaveBeenCalled()
      if (stage === 'entry')
        expect(thumbnailGenerator.generateThumbnails).not.toHaveBeenCalled()
      if (stage === 'entry' || stage === 'lookup' || stage === 'progress') {
        expect(previewRepository.replaceFrames).not.toHaveBeenCalled()
      }
      if (stage !== 'aggregate')
        expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
    },
  )

  test('retains legacy thumbnails and does not publish when preview persistence aborts', async () => {
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () =>
        buildVideoAggregate({ thumbUrls: ['legacy-1', 'legacy-2'] }),
      ),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const previewRepository = buildPreviewRepository()
    previewRepository.replaceFrames = vi.fn(async () => {
      throw new DOMException('Late abort', 'AbortError')
    })
    const eventPublisher = {
      publish: vi.fn(async () => {}),
      publishBatch: vi.fn(async () => {}),
    }
    const useCase = new UpdateVideoThumbnailsUseCase(
      { generateThumbnails: vi.fn(async () => previewFrames) },
      aggregateRepository,
      buildSessionRegistry(),
      eventPublisher,
      previewRepository,
    )

    await expect(
      useCase.execute(buildParsedVideo({ url: 'blob:video' })),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
    expect(eventPublisher.publish).not.toHaveBeenCalled()
  })

  test('drops generated thumbnails when the aggregate no longer exists before persist', async () => {
    const thumbnailGenerator: IVideoThumbnailGenerator = {
      generateThumbnails: vi.fn(async () => previewFrames),
    }
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () => undefined),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const sessionRegistry: IVideoSessionRegistry = buildSessionRegistry({
      acquireObjectUrl: vi.fn(() => 'blob:session-video'),
    })
    const eventPublisher: IEventPublisher = {
      publish: vi.fn(async () => {}),
      publishBatch: vi.fn(async () => {}),
    }
    const previewRepository = buildPreviewRepository()

    const useCase = new UpdateVideoThumbnailsUseCase(
      thumbnailGenerator,
      aggregateRepository,
      sessionRegistry,
      eventPublisher,
      previewRepository,
    )

    const original = buildParsedVideo({ id: 'id-1', url: '' })
    const updated = await useCase.execute(original)
    expect(previewRepository.replaceFrames).not.toHaveBeenCalled()

    expect(updated).toEqual(original)
    expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
    expect(eventPublisher.publish).not.toHaveBeenCalled()
  })

  test('persists thumbnails onto the latest aggregate snapshot instead of the stale request video', async () => {
    const thumbnailGenerator: IVideoThumbnailGenerator = {
      generateThumbnails: vi.fn(async () => previewFrames),
    }
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () =>
        buildVideoAggregate({
          id: 'id-1',
          title: 'latest-title.mp4',
          votes: 9,
          tags: ['latest'],
        }),
      ),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const sessionRegistry: IVideoSessionRegistry = buildSessionRegistry({
      acquireObjectUrl: vi.fn(() => 'blob:session-video'),
    })
    const eventPublisher: IEventPublisher = {
      publish: vi.fn(async () => {}),
      publishBatch: vi.fn(async () => {}),
    }
    const previewRepository = buildPreviewRepository()

    const useCase = new UpdateVideoThumbnailsUseCase(
      thumbnailGenerator,
      aggregateRepository,
      sessionRegistry,
      eventPublisher,
      previewRepository,
    )

    const original = buildParsedVideo({
      id: 'id-1',
      title: 'stale-title.mp4',
      votes: 1,
      thumbUrls: ['legacy-1', 'legacy-2'],
      tags: ['stale'],
      url: '',
    })
    const updated = await useCase.execute(original)

    expect(aggregateRepository.updateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id-1',
        title: 'latest-title.mp4',
        votes: 9,
        tags: ['latest'],
        thumbUrls: [],
      }),
    )
    expect(previewRepository.replaceFrames).toHaveBeenCalledWith(
      'id-1',
      previewFrames,
    )
    expect(updated).toEqual(
      expect.objectContaining({
        id: 'id-1',
        title: 'latest-title.mp4',
        votes: 9,
        tags: ['latest'],
        thumbUrls: [],
        previewFrames,
      }),
    )
  })

  test('propagates cancellation without persisting or publishing previews', async () => {
    const abortError = new DOMException('cancelled', 'AbortError')
    const thumbnailGenerator: IVideoThumbnailGenerator = {
      generateThumbnails: vi.fn(async () => {
        throw abortError
      }),
    }
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () => buildVideoAggregate({ id: 'id-1' })),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const previewRepository = buildPreviewRepository()
    const sessionRegistry = buildSessionRegistry({
      acquireObjectUrl: vi.fn(() => 'blob:session-video'),
    })
    const eventPublisher: IEventPublisher = {
      publish: vi.fn(async () => {}),
      publishBatch: vi.fn(async () => {}),
    }
    const useCase = new UpdateVideoThumbnailsUseCase(
      thumbnailGenerator,
      aggregateRepository,
      sessionRegistry,
      eventPublisher,
      previewRepository,
    )
    const controller = new AbortController()

    await expect(
      useCase.execute(buildParsedVideo({ id: 'id-1' }), {
        signal: controller.signal,
      }),
    ).rejects.toBe(abortError)

    expect(previewRepository.replaceFrames).not.toHaveBeenCalled()
    expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
    expect(eventPublisher.publish).not.toHaveBeenCalled()
  })

  test.each([1, 2, 8])(
    'keeps the last known thumbnails when generation returns only %i frames',
    async (count) => {
      const thumbnailGenerator: IVideoThumbnailGenerator = {
        generateThumbnails: vi.fn(async () => previewFrames.slice(0, count)),
      }
      const aggregateRepository: IVideoAggregateRepository = {
        getVideo: vi.fn(async () => buildVideoAggregate({ id: 'id-1' })),
        getAllVideos: vi.fn(async () => []),
        postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
        updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
        updateVotes: vi.fn(async () => null),
        wipeData: vi.fn(async () => {}),
      }
      const previewRepository = buildPreviewRepository()
      const sessionRegistry = buildSessionRegistry({
        acquireObjectUrl: vi.fn(() => 'blob:session-video'),
      })
      const eventPublisher: IEventPublisher = {
        publish: vi.fn(async () => {}),
        publishBatch: vi.fn(async () => {}),
      }
      const useCase = new UpdateVideoThumbnailsUseCase(
        thumbnailGenerator,
        aggregateRepository,
        sessionRegistry,
        eventPublisher,
        previewRepository,
      )
      const original = buildParsedVideo({
        id: 'id-1',
        thumbUrls: ['legacy-1', 'legacy-2'],
      })

      const updated = await useCase.execute(original)

      expect(updated).toEqual(original)
      expect(previewRepository.replaceFrames).not.toHaveBeenCalled()
      expect(aggregateRepository.getVideo).not.toHaveBeenCalled()
      expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
      expect(eventPublisher.publish).not.toHaveBeenCalled()
    },
  )

  test.each([2, 8])(
    'backfills an existing %i-frame set with the complete set',
    async (count) => {
      const previews = buildPreviewRepository()
      const generator = { generateThumbnails: vi.fn(async () => previewFrames) }
      const repository: IVideoAggregateRepository = {
        getVideo: vi.fn(async () => buildVideoAggregate()),
        getAllVideos: vi.fn(async () => []),
        postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
        updateVideo: vi.fn(async (video) => buildVideoAggregate(video)),
        updateVotes: vi.fn(async () => null),
        wipeData: vi.fn(async () => {}),
      }
      const useCase = new UpdateVideoThumbnailsUseCase(
        generator,
        repository,
        buildSessionRegistry(),
        { publish: vi.fn(), publishBatch: vi.fn() },
        previews,
      )
      const result = await useCase.execute(
        buildParsedVideo({
          url: 'blob:video',
          previewFrames: previewFrames.slice(0, count),
          thumbUrls: Array(9).fill('legacy'),
        }),
      )
      expect(result.previewFrames).toHaveLength(9)
      expect(previews.replaceFrames).toHaveBeenCalledWith('id-1', previewFrames)
    },
  )
})
