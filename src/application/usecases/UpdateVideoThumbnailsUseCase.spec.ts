import { describe, expect, test, vi } from 'vitest'
import type { IVideoAggregateRepository } from '@domain/repositories'
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

describe('UpdateVideoThumbnailsUseCase', () => {
  test('drops generated thumbnails when the aggregate no longer exists before persist', async () => {
    const thumbnailGenerator: IVideoThumbnailGenerator = {
      generateThumbnails: vi.fn(async () => ['thumb-1', 'thumb-2']),
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

    const useCase = new UpdateVideoThumbnailsUseCase(
      thumbnailGenerator,
      aggregateRepository,
      sessionRegistry,
      eventPublisher,
    )

    const original = buildParsedVideo({ id: 'id-1', url: '' })
    const updated = await useCase.execute(original)

    expect(updated).toEqual(original)
    expect(aggregateRepository.updateVideo).not.toHaveBeenCalled()
    expect(eventPublisher.publish).not.toHaveBeenCalled()
  })

  test('persists thumbnails onto the latest aggregate snapshot instead of the stale request video', async () => {
    const thumbnailGenerator: IVideoThumbnailGenerator = {
      generateThumbnails: vi.fn(async () => ['thumb-1', 'thumb-2']),
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

    const useCase = new UpdateVideoThumbnailsUseCase(
      thumbnailGenerator,
      aggregateRepository,
      sessionRegistry,
      eventPublisher,
    )

    const original = buildParsedVideo({
      id: 'id-1',
      title: 'stale-title.mp4',
      votes: 1,
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
        thumbUrls: ['thumb-1', 'thumb-2'],
      }),
    )
    expect(updated).toEqual(
      expect.objectContaining({
        id: 'id-1',
        title: 'latest-title.mp4',
        votes: 9,
        tags: ['latest'],
        thumbUrls: ['thumb-1', 'thumb-2'],
      }),
    )
  })
})
