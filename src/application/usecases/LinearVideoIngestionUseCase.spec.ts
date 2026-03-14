import { describe, expect, test, vi } from 'vitest'
import type { ParsedVideo } from '@domain/entities'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  IVideoIngestionFailureTracker,
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
} from '@app/ports'
import type { VideoImportItem } from '@domain/valueObjects'
import {
  buildLogger,
  buildSessionRegistry,
  buildVideoAggregate,
  buildVideoEntity,
} from '@test-utils/index'
import { LinearVideoIngestionUseCase } from './LinearVideoIngestionUseCase'

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

  const sessionRegistry: IVideoSessionRegistry = buildSessionRegistry()
  const logger: ILogger = buildLogger()

  return {
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    logger,
    ...overrides,
  }
}

const buildFailureTracker = (
  overrides: Partial<IVideoIngestionFailureTracker> = {},
): IVideoIngestionFailureTracker => ({
  hasFailure: vi.fn(async () => false),
  recordFailure: vi.fn(async () => {}),
  clearFailure: vi.fn(async () => {}),
  ...overrides,
})

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

const collectVideos = (items: Array<any>): ParsedVideo[] =>
  items
    .filter((item) => item?.type === 'video')
    .map((item) => item.video as ParsedVideo)

describe('LinearVideoIngestionUseCase', () => {
  test('yields previously scanned videos before parsing unseen items', async () => {
    const newFile = new File(['video-bytes'], 'new.mp4', { type: 'video/mp4' })
    const cachedFile = new File(['video-bytes'], 'cached.mp4', {
      type: 'video/mp4',
    })
    const items: VideoImportItem[] = [{ file: newFile }, { file: cachedFile }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockResolvedValueOnce('id-new')
          .mockResolvedValueOnce('id-cached'),
        extract: vi.fn(async () => ({
          videoEntity: buildVideoEntity({
            id: 'id-new',
            title: 'new.mp4',
            thumb: 'thumb-new',
            duration: 12,
          }),
          url: '',
        })),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(buildVideoAggregate({ id: 'id-cached' })),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(results).toHaveLength(2)
    expect(results.map((video) => video.id)).toEqual(['id-cached', 'id-new'])
    expect(deps.metadataExtractor.extract).toHaveBeenCalledTimes(1)
    expect(failureTracker.hasFailure).toHaveBeenCalledWith('id-new')
    expect(deps.sessionRegistry.registerFile).toHaveBeenCalledWith(
      'id-cached',
      cachedFile,
    )
  })

  test('defers previously failed items until after unseen items', async () => {
    const retryFile = new File(['video-bytes'], 'retry.mp4', {
      type: 'video/mp4',
    })
    const freshFile = new File(['video-bytes'], 'fresh.mp4', {
      type: 'video/mp4',
    })
    const items: VideoImportItem[] = [{ file: retryFile }, { file: freshFile }]
    const failureTracker = buildFailureTracker({
      hasFailure: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    })

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockResolvedValueOnce('id-retry')
          .mockResolvedValueOnce('id-fresh'),
        extract: vi
          .fn()
          .mockResolvedValueOnce({
            videoEntity: buildVideoEntity({
              id: 'id-fresh',
              title: 'fresh.mp4',
              thumb: 'thumb-fresh',
              duration: 10,
            }),
            url: '',
          })
          .mockResolvedValueOnce({
            videoEntity: buildVideoEntity({
              id: 'id-retry',
              title: 'retry.mp4',
              thumb: 'thumb-retry',
              duration: 11,
            }),
            url: '',
          }),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(results.map((video) => video.id)).toEqual(['id-fresh', 'id-retry'])
    expect(failureTracker.clearFailure).toHaveBeenCalledWith('id-retry')
  })

  test('yields cached videos and registers their files in session storage', async () => {
    const file = new File(['video-bytes'], 'cached.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-cached'),
        extract: vi.fn(async () => null),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => buildVideoAggregate({ id: 'id-cached' })),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(deps.metadataExtractor.generateId).toHaveBeenCalledWith(file)
    expect(deps.metadataExtractor.extract).not.toHaveBeenCalled()
    expect(deps.aggregateRepository.postVideo).not.toHaveBeenCalled()
    expect(deps.sessionRegistry.registerFile).toHaveBeenCalledWith(
      'id-cached',
      file,
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(
      expect.objectContaining({ id: 'id-cached', url: '', pinned: false }),
    )
  })

  test('extracts, persists, and yields new videos with mapped metadata fields', async () => {
    const file = new File(['video-bytes'], 'new.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-new'),
        extract: vi.fn(async () => ({
          videoEntity: buildVideoEntity({
            id: 'id-new',
            title: 'new.mp4',
            thumb: 'thumb-data-url',
            duration: 37,
            thumbUrls: [],
            tags: [],
          }),
          url: 'blob:temp-url-not-used',
        })),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(deps.metadataExtractor.generateId).toHaveBeenCalledWith(file)
    expect(deps.metadataExtractor.extract).toHaveBeenCalledWith(file, {
      idHint: 'id-new',
    })
    expect(deps.aggregateRepository.postVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id-new',
        title: 'new.mp4',
        thumb: 'thumb-data-url',
        duration: 37,
      }),
    )
    expect(deps.sessionRegistry.registerFile).toHaveBeenCalledWith(
      'id-new',
      file,
    )
    expect(failureTracker.clearFailure).toHaveBeenCalledWith('id-new')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(
      expect.objectContaining({ id: 'id-new', url: '', pinned: false }),
    )
  })

  test('skips invalid/unplayable files when extractor returns null', async () => {
    const file = new File(['bad-bytes'], 'bad.mov', { type: 'video/quicktime' })
    const items: VideoImportItem[] = [{ file }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi.fn(async () => 'id-invalid'),
        extract: vi.fn(async () => null),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(results).toHaveLength(0)
    expect(deps.aggregateRepository.postVideo).not.toHaveBeenCalled()
    expect(deps.sessionRegistry.registerFile).not.toHaveBeenCalled()
    expect(failureTracker.recordFailure).toHaveBeenCalledWith('id-invalid')
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  test('continues ingesting later files when one file fails unexpectedly', async () => {
    const first = new File(['broken-bytes'], 'broken.mp4', {
      type: 'video/mp4',
    })
    const second = new File(['video-bytes'], 'ok.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file: first }, { file: second }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockResolvedValueOnce('id-broken')
          .mockResolvedValueOnce('id-ok'),
        extract: vi
          .fn()
          .mockRejectedValueOnce(new Error('decoder error'))
          .mockResolvedValueOnce({
            videoEntity: buildVideoEntity({
              id: 'id-ok',
              title: 'ok.mp4',
              thumb: 'thumb-ok',
              duration: 10,
            }),
            url: '',
          }),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => undefined),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const results = collectVideos(events)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({ id: 'id-ok' }))
    expect(failureTracker.recordFailure).toHaveBeenCalledWith('id-broken')
    expect(failureTracker.clearFailure).toHaveBeenCalledWith('id-ok')
    expect(deps.logger.error).toHaveBeenCalled()
  })

  test('emits progress snapshots while classifying and processing ingestion items', async () => {
    const cached = new File(['cached'], 'cached.mp4', { type: 'video/mp4' })
    const fresh = new File(['fresh'], 'fresh.mp4', { type: 'video/mp4' })
    const retry = new File(['retry'], 'retry.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [
      { file: cached },
      { file: fresh },
      { file: retry },
    ]
    const failureTracker = buildFailureTracker({
      hasFailure: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    })

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockResolvedValueOnce('id-cached')
          .mockResolvedValueOnce('id-fresh')
          .mockResolvedValueOnce('id-retry'),
        extract: vi
          .fn()
          .mockResolvedValueOnce({
            videoEntity: buildVideoEntity({
              id: 'id-fresh',
              title: 'fresh.mp4',
              thumb: 'thumb-fresh',
              duration: 12,
            }),
            url: '',
          })
          .mockResolvedValueOnce(null),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi
          .fn()
          .mockResolvedValueOnce(buildVideoAggregate({ id: 'id-cached' }))
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items) as AsyncIterable<any>)
    const progressEvents = events.filter((event) => event?.type === 'progress')

    expect(progressEvents.length).toBeGreaterThan(0)
    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        progress: expect.objectContaining({
          total: 3,
          existingCount: 1,
          newCount: 1,
          knownErrorCount: 1,
        }),
      }),
    )
    expect(progressEvents.at(-1)).toEqual(
      expect.objectContaining({
        progress: expect.objectContaining({
          completedCount: 3,
          createdCount: 1,
          failedCount: 1,
        }),
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'video',
        video: expect.objectContaining({ id: 'id-cached' }),
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'video',
        video: expect.objectContaining({ id: 'id-fresh' }),
      }),
    )
  })

  test('counts partition failures as completed work even when no processing loop runs', async () => {
    const brokenA = new File(['broken-a'], 'broken-a.mp4', { type: 'video/mp4' })
    const brokenB = new File(['broken-b'], 'broken-b.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file: brokenA }, { file: brokenB }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockRejectedValueOnce(new Error('bad-a'))
          .mockRejectedValueOnce(new Error('bad-b')),
        extract: vi.fn(async () => null),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const progressEvents = events.filter((event) => event?.type === 'progress')

    expect(progressEvents).toHaveLength(1)
    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        progress: expect.objectContaining({
          total: 2,
          failedCount: 2,
          completedCount: 2,
        }),
      }),
    )
  })

  test('includes partition failures in the initial completed count when only cached items remain', async () => {
    const cached = new File(['cached'], 'cached.mp4', { type: 'video/mp4' })
    const broken = new File(['broken'], 'broken.mp4', { type: 'video/mp4' })
    const items: VideoImportItem[] = [{ file: cached }, { file: broken }]
    const failureTracker = buildFailureTracker()

    const deps = makeDeps({
      metadataExtractor: {
        generateId: vi
          .fn()
          .mockResolvedValueOnce('id-cached')
          .mockRejectedValueOnce(new Error('bad-b')),
        extract: vi.fn(async () => null),
      },
      aggregateRepository: {
        ...makeDeps().aggregateRepository,
        getVideo: vi.fn(async () => buildVideoAggregate({ id: 'id-cached' })),
      },
    })

    const useCase = new LinearVideoIngestionUseCase(
      deps.metadataExtractor,
      deps.aggregateRepository,
      deps.sessionRegistry,
      deps.logger,
      failureTracker,
    )

    const events = await collect(useCase.execute(items))
    const progressEvents = events.filter((event) => event?.type === 'progress')

    expect(progressEvents[0]).toEqual(
      expect.objectContaining({
        type: 'progress',
        progress: expect.objectContaining({
          total: 2,
          existingCount: 1,
          failedCount: 1,
          completedCount: 2,
        }),
      }),
    )
  })
})
