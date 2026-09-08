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
import type { MetadataEntity, VideoEntity } from '@domain/entities'

function createRepository() {
  const metadata = new Map<string, MetadataEntity>()
  const videos = new Map<string, VideoEntity>()
  const metadataRepository = {
    getMetadata: async (id: string) => metadata.get(id),
    getAllMetadata: async () => [...metadata.values()],
    createMetadata: vi.fn(async (value: MetadataEntity) => {
      if (!metadata.has(value.id)) metadata.set(value.id, { ...value })
      return metadata.get(value.id)!
    }),
    upsertMetadata: vi.fn(async (value: MetadataEntity) => {
      metadata.set(value.id, { ...value })
      return value
    }),
    deleteMetadata: async (id: string) => {
      metadata.delete(id)
    },
  }
  const videoRepository: IVideoRepository = {
    getVideo: async (id) => videos.get(id),
    getAllVideos: async () => [...videos.values()],
    postVideo: async (value) => {
      videos.set(value.id, value)
      return value
    },
    deleteVideo: async (id) => {
      videos.delete(id)
    },
  }
  return {
    metadata,
    videos,
    metadataRepository,
    repository: new VideoAggregateRepository(
      metadataRepository,
      videoRepository,
      buildLogger(),
    ),
  }
}

describe('VideoAggregateRepository', () => {
  test.each([17, -4, 0])(
    'reconstructing missing content preserves %s saved votes',
    async (votes) => {
      const f = createRepository()
      const video = buildVideoEntity()
      f.metadata.set(video.id, { id: video.id, votes })
      expect(await f.repository.getVideo(video.id)).toBeUndefined()

      const result = await f.repository.postVideo(video)

      expect(result.votes).toBe(votes)
      expect(f.metadata.get(video.id)?.votes).toBe(votes)
      expect(f.videos.get(video.id)).toEqual(video)
      expect(f.metadataRepository.upsertMetadata).not.toHaveBeenCalled()
    },
  )

  test('new content starts at zero but posting it again preserves votes', async () => {
    const f = createRepository()
    const video = buildVideoEntity()
    expect((await f.repository.postVideo(video)).votes).toBe(0)
    await f.repository.updateVotes(video.id, 5)

    expect((await f.repository.postVideo(video)).votes).toBe(5)
    expect(f.metadata.get(video.id)?.votes).toBe(5)
  })

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
      createMetadata: vi.fn(async (metadata) => metadata),
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
