import { describe, expect, test, vi } from 'vitest'
import type {
  IMetadataRepository,
  IVideoRepository,
} from '@domain/repositories'
import {
  buildLogger,
  buildVideoAggregate,
  buildVideoEntity,
} from '@test-utils/index'
import { VideoAggregateRepository } from './VideoAggregateRepository'

describe('VideoAggregateRepository', () => {
  test('updating video content does not overwrite newer votes from stale input', async () => {
    const metadataRepository: IMetadataRepository = {
      getMetadata: vi.fn(async () => ({ id: 'id-1', votes: 3 })),
      getAllMetadata: vi.fn(async () => []),
      upsertMetadata: vi.fn(async (metadata) => metadata),
      deleteMetadata: vi.fn(async () => {}),
    }
    const videoRepository: IVideoRepository = {
      getVideo: vi.fn(async () => buildVideoEntity()),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => video),
      deleteVideo: vi.fn(async () => {}),
    }
    const repository = new VideoAggregateRepository(
      metadataRepository,
      videoRepository,
      buildLogger(),
    )

    const updated = await repository.updateVideo(
      buildVideoAggregate({ votes: 2, thumbUrls: [] }),
    )

    expect(metadataRepository.upsertMetadata).not.toHaveBeenCalled()
    expect(updated?.votes).toBe(3)
    expect(videoRepository.postVideo).toHaveBeenCalledWith(
      buildVideoEntity({ thumbUrls: [] }),
    )
  })
})
