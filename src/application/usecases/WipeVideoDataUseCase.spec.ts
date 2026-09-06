import { describe, expect, test, vi } from 'vitest'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import { WipeVideoDataUseCase } from './WipeVideoDataUseCase'

describe('WipeVideoDataUseCase', () => {
  test('waits for every started clear to settle before reporting a failure', async () => {
    let finish = () => {}
    const failure = new Error('Cache clear failed')
    const aggregate = {
      wipeData: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      ),
    } as unknown as IVideoAggregateRepository
    const previews = {
      clear: vi.fn(async () => {}),
    } as unknown as IVideoPreviewRepository
    const cache = {
      epoch: 0,
      getProducts: vi.fn(),
      putProduct: vi.fn(),
      clear: vi.fn(async () => {
        throw failure
      }),
    }
    const settled = vi.fn()
    const pending = new WipeVideoDataUseCase(aggregate, previews, cache)
      .execute()
      .catch(settled)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).not.toHaveBeenCalled()
    finish()
    await pending
    expect(settled).toHaveBeenCalledWith(failure)
  })
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
    const previewCache = {
      epoch: 0,
      getProducts: vi.fn(),
      putProduct: vi.fn(),
      clear: vi.fn(async () => {}),
    }
    const useCase = new WipeVideoDataUseCase(
      aggregateRepository,
      previewRepository,
      previewCache,
    )

    await useCase.execute()

    expect(aggregateRepository.wipeData).toHaveBeenCalledOnce()
    expect(previewRepository.clear).toHaveBeenCalledOnce()
    expect(previewCache.clear).toHaveBeenCalledOnce()
  })
})
