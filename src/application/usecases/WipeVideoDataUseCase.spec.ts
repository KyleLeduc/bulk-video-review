import { describe, expect, test, vi } from 'vitest'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import { WipeVideoDataUseCase } from './WipeVideoDataUseCase'

describe('WipeVideoDataUseCase', () => {
  test('clears both video aggregates and persisted preview blobs', async () => {
    const aggregateRepository: IVideoAggregateRepository = {
      getVideo: vi.fn(async () => undefined),
      getAllVideos: vi.fn(async () => []),
      postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
      updateVideo: vi.fn(async (video) => video),
      updateVotes: vi.fn(async () => null),
      wipeData: vi.fn(async () => {}),
    }
    const previewRepository: IVideoPreviewRepository = {
      getFrames: vi.fn(async () => []),
      replaceFrames: vi.fn(async () => {}),
      deleteFrames: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    }
    const useCase = new WipeVideoDataUseCase(
      aggregateRepository,
      previewRepository,
    )

    await useCase.execute()

    expect(aggregateRepository.wipeData).toHaveBeenCalledOnce()
    expect(previewRepository.clear).toHaveBeenCalledOnce()
  })
})
