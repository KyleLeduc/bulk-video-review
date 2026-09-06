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
  test('a failed deletion does not settle wipe while sibling deletions are active', async () => {
    let finish = () => {}
    const failure = new Error('delete failed')
    const metadata = {
      getAllMetadata: vi.fn(async () => [{ id: 'one', votes: 0 }]),
      deleteMetadata: vi.fn(async () => {
        throw failure
      }),
    } as unknown as IMetadataRepository
    const videos = {
      getAllVideos: vi.fn(async () => [buildVideoEntity()]),
      deleteVideo: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    } as unknown as IVideoRepository
    const settled = vi.fn()
    const pending = new VideoAggregateRepository(
      metadata,
      videos,
      buildLogger(),
    )
      .wipeData()
      .catch(settled)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).not.toHaveBeenCalled()
    finish()
    await pending
    expect(settled).toHaveBeenCalledWith(failure)
  })
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
