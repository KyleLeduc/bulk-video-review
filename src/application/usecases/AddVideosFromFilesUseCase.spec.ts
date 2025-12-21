import { describe, expect, test, vi } from 'vitest'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
} from '@app/ports'
import type { VideoImportItem } from '@domain/valueObjects'
import { AddVideosFromFilesUseCase } from './AddVideosFromFilesUseCase'

type UseCaseDeps = {
  metadataExtractor: IVideoMetadataExtractor
  aggregateRepository: IVideoAggregateRepository
  sessionRegistry: IVideoSessionRegistry
  logger: ILogger
}

const makeDeps = (overrides: Partial<UseCaseDeps> = {}): UseCaseDeps => {
  const metadataExtractor: IVideoMetadataExtractor = {
    generateId: vi.fn(async () => 'id-default'),
    extract: vi.fn(async () => null),
  }

  const aggregateRepository: IVideoAggregateRepository = {
    getVideo: vi.fn(async () => undefined),
    getAllVideos: vi.fn(async () => []),
    postVideo: vi.fn(async (video) => ({ ...video, votes: 0 })),
    updateVideo: vi.fn(async (video) => video),
    updateVotes: vi.fn(async () => null),
    wipeData: vi.fn(async () => {}),
  }

  const sessionRegistry: IVideoSessionRegistry = {
    registerFile: vi.fn(),
    unregisterFile: vi.fn(),
    acquireObjectUrl: vi.fn(() => null),
    releaseObjectUrl: vi.fn(),
  }

  const logger: ILogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }

  return {
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    logger,
    ...overrides,
  }
}

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

const stubUrlFunction = <T extends (...args: any[]) => any>(
  key: 'revokeObjectURL' | 'createObjectURL',
  impl: T,
) => {
  const original = (URL as any)[key] as undefined | T
  const spy = vi.fn(impl) as unknown as T

  Object.defineProperty(URL, key, {
    value: spy,
    configurable: true,
    writable: true,
  })

  return {
    spy,
    restore: () => {
      if (typeof original === 'function') {
        Object.defineProperty(URL, key, {
          value: original,
          configurable: true,
          writable: true,
        })
      } else {
        delete (URL as any)[key]
      }
    },
  }
}

describe('AddVideosFromFilesUseCase', () => {
  test('yields cached videos without re-extracting and registers files in the session registry', async () => {
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file }]

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-1'),
        extract: vi.fn(async () => null),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => ({
          id: 'id-1',
          title: 'sample.mp4',
          thumb: '',
          duration: 0,
          thumbUrls: [],
          tags: [],
          votes: 0,
        })),
      },
    })

    const useCase = new AddVideosFromFilesUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.logger,
      deps.sessionRegistry,
    )

    const results = await collect(useCase.execute(items))

    expect(deps.metadataExtractor.generateId).toHaveBeenCalledWith(file)
    expect(deps.metadataExtractor.extract).not.toHaveBeenCalled()
    expect(deps.aggregateRepository.postVideo).not.toHaveBeenCalled()
    expect(deps.sessionRegistry.registerFile).toHaveBeenCalledWith('id-1', file)
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('id-1')
    expect(results[0]?.url).toBe('')
    expect(results[0]?.pinned).toBe(false)
  })

  test('extracts and persists new videos, registers the file, and revokes blob URLs', async () => {
    const file = new File(['video-bytes'], 'new.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file }]

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-2'),
        extract: vi.fn(async () => ({
          videoEntity: {
            id: 'id-2',
            title: 'new.mp4',
            thumb: 't',
            duration: 123,
            thumbUrls: ['a'],
            tags: ['tag'],
          },
          url: 'blob:temp-url',
        })),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
      },
    })

    const { spy: revokeSpy, restore } = stubUrlFunction(
      'revokeObjectURL',
      () => undefined,
    )

    try {
      const useCase = new AddVideosFromFilesUseCase(
        deps.metadataExtractor,
        deps.aggregateRepository,
        deps.logger,
        deps.sessionRegistry,
      )

      const results = await collect(useCase.execute(items))

      expect(deps.metadataExtractor.generateId).toHaveBeenCalledWith(file)
      expect(deps.metadataExtractor.extract).toHaveBeenCalledWith(file, {
        idHint: 'id-2',
      })
      expect(deps.aggregateRepository.postVideo).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'id-2' }),
      )
      expect(deps.sessionRegistry.registerFile).toHaveBeenCalledWith(
        'id-2',
        file,
      )
      expect(revokeSpy).toHaveBeenCalledWith('blob:temp-url')

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(
        expect.objectContaining({ id: 'id-2', url: '', pinned: false }),
      )
    } finally {
      restore()
    }
  })

  test('revokes blob URLs even when persistence fails, then returns null for that item', async () => {
    const file = new File(['video-bytes'], 'broken.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file }]

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-3'),
        extract: vi.fn(async () => ({
          videoEntity: {
            id: 'id-3',
            title: 'broken.mp4',
            thumb: 't',
            duration: 1,
            thumbUrls: [],
            tags: [],
          },
          url: 'blob:temp-url-3',
        })),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
        postVideo: vi.fn(async () => {
          throw new Error('db down')
        }),
      },
    })

    const { spy: revokeSpy, restore } = stubUrlFunction(
      'revokeObjectURL',
      () => undefined,
    )

    try {
      const useCase = new AddVideosFromFilesUseCase(
        deps.metadataExtractor,
        deps.aggregateRepository,
        deps.logger,
        deps.sessionRegistry,
      )

      const results = await collect(useCase.execute(items))

      expect(results).toHaveLength(0)
      expect(revokeSpy).toHaveBeenCalledWith('blob:temp-url-3')
      expect(deps.logger.error).toHaveBeenCalledWith(
        'Failed to process file',
        expect.any(Error),
      )
    } finally {
      restore()
    }
  })
})
