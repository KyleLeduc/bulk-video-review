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
})
