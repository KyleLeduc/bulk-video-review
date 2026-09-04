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

describe('LinearVideoIngestionUseCase preview hydration', () => {
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
