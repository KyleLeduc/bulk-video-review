import { describe, expect, test, vi } from 'vitest'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  IVideoIngestionFailureTracker,
  IVideoMetadataExtractor,
} from '@app/ports'
import {
  buildLogger,
  buildSessionRegistry,
  buildVideoAggregate,
  buildVideoEntity,
} from '@test-utils/index'
import { LinearVideoIngestionUseCase } from './LinearVideoIngestionUseCase'
import type { VideoIngestionEvent } from './VideoIngestionUseCase'

const collect = async (
  iterable: AsyncIterable<VideoIngestionEvent>,
): Promise<VideoIngestionEvent[]> => {
  const events: VideoIngestionEvent[] = []
  for await (const event of iterable) {
    events.push(event)
  }
  return events
}

const createHarness = (
  overrides: {
    metadataExtractor?: Partial<IVideoMetadataExtractor>
    aggregateRepository?: Partial<IVideoAggregateRepository>
    failureTracker?: Partial<IVideoIngestionFailureTracker>
  } = {},
) => {
  const metadataExtractor: IVideoMetadataExtractor = {
    generateId: vi.fn(async (file) => `id-${file.name}`),
    extract: vi.fn(async (_file, options) => ({
      videoEntity: buildVideoEntity({ id: options?.idHint }),
      url: '',
    })),
    ...overrides.metadataExtractor,
  }
  const aggregateRepository: IVideoAggregateRepository = {
    getVideo: vi.fn(async () => undefined),
    getAllVideos: vi.fn(async () => []),
    postVideo: vi.fn(async (video) => buildVideoAggregate(video)),
    updateVideo: vi.fn(async (video) => video),
    updateVotes: vi.fn(async () => null),
    wipeData: vi.fn(async () => {}),
    ...overrides.aggregateRepository,
  }
  const failureTracker: IVideoIngestionFailureTracker = {
    hasFailure: vi.fn(async () => false),
    recordFailure: vi.fn(async () => {}),
    clearFailure: vi.fn(async () => {}),
    ...overrides.failureTracker,
  }
  const sessionRegistry = buildSessionRegistry()
  const useCase = new LinearVideoIngestionUseCase(
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    buildLogger(),
    failureTracker,
  )

  return {
    useCase,
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
  }
}

const createControlledExtraction = () => {
  let releaseImmediately = false
  let activeCount = 0
  let maxActiveCount = 0
  const pending = new Map<string, () => void>()

  const extract = vi.fn<IVideoMetadataExtractor['extract']>(
    (file, options) =>
      new Promise((resolve) => {
        let settled = false
        activeCount += 1
        maxActiveCount = Math.max(maxActiveCount, activeCount)

        const finish = () => {
          if (settled) {
            return
          }
          settled = true
          activeCount -= 1
          pending.delete(file.name)
          resolve({
            videoEntity: buildVideoEntity({
              id: options?.idHint,
              title: file.name,
            }),
            url: '',
          })
        }

        pending.set(file.name, finish)
        if (releaseImmediately) {
          queueMicrotask(finish)
        }
      }),
  )

  return {
    extract,
    release(fileName: string) {
      pending.get(fileName)?.()
    },
    releaseAll() {
      releaseImmediately = true
      pending.forEach((finish) => finish())
    },
    get maxActiveCount() {
      return maxActiveCount
    },
  }
}

describe('LinearVideoIngestionUseCase bounded concurrency', () => {
  test('starts two identification jobs and refills the first available slot', async () => {
    const files = ['one.mp4', 'two.mp4', 'three.mp4'].map(
      (name) => new File([name], name, { type: 'video/mp4' }),
    )
    let releaseImmediately = false
    let activeCount = 0
    let maxActiveCount = 0
    const pending: Array<() => void> = []
    const generateId = vi.fn(
      (file: File) =>
        new Promise<string>((resolve) => {
          let settled = false
          activeCount += 1
          maxActiveCount = Math.max(maxActiveCount, activeCount)

          const finish = () => {
            if (settled) {
              return
            }
            settled = true
            activeCount -= 1
            resolve(`id-${file.name}`)
          }

          pending.push(finish)
          if (releaseImmediately) {
            queueMicrotask(finish)
          }
        }),
    )
    const { useCase } = createHarness({
      metadataExtractor: { generateId },
      aggregateRepository: {
        getVideo: vi.fn(async (id) => buildVideoAggregate({ id })),
      },
    })
    const collection = collect(
      useCase.execute(
        files.map((file) => ({ file })),
        { concurrency: 2 },
      ),
    )

    try {
      await vi.waitFor(() => expect(generateId).toHaveBeenCalledTimes(2))

      pending[0]?.()
      await vi.waitFor(() => expect(generateId).toHaveBeenCalledTimes(3))

      expect(maxActiveCount).toBe(2)
    } finally {
      releaseImmediately = true
      pending.forEach((finish) => finish())
      await collection
    }
  })

  test('processes fresh videos concurrently and emits faster results first', async () => {
    const files = ['one.mp4', 'two.mp4', 'three.mp4'].map(
      (name) => new File([name], name, { type: 'video/mp4' }),
    )
    const controlled = createControlledExtraction()
    const { useCase, metadataExtractor } = createHarness({
      metadataExtractor: { extract: controlled.extract },
    })
    const collection = collect(
      useCase.execute(
        files.map((file) => ({ file })),
        { concurrency: 2 },
      ),
    )

    try {
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(2),
      )

      controlled.release('two.mp4')
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(3),
      )

      controlled.release('three.mp4')
      controlled.release('one.mp4')
      const events = await collection
      const videoIds = events
        .filter(
          (event): event is Extract<VideoIngestionEvent, { type: 'video' }> =>
            event.type === 'video',
        )
        .map((event) => event.video.id)

      expect(videoIds).toEqual(['id-two.mp4', 'id-three.mp4', 'id-one.mp4'])
      expect(controlled.maxActiveCount).toBe(2)
    } finally {
      controlled.releaseAll()
      await collection
    }
  })

  test('fully drains fresh work before starting the retry lane', async () => {
    const retry = new File(['retry'], 'retry.mp4', { type: 'video/mp4' })
    const freshA = new File(['fresh-a'], 'fresh-a.mp4', {
      type: 'video/mp4',
    })
    const freshB = new File(['fresh-b'], 'fresh-b.mp4', {
      type: 'video/mp4',
    })
    const controlled = createControlledExtraction()
    const { useCase, metadataExtractor } = createHarness({
      metadataExtractor: { extract: controlled.extract },
      failureTracker: {
        hasFailure: vi.fn(async (id) => id === 'id-retry.mp4'),
      },
    })
    const collection = collect(
      useCase.execute([{ file: retry }, { file: freshA }, { file: freshB }], {
        concurrency: 2,
      }),
    )

    try {
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(2),
      )
      expect(
        vi
          .mocked(metadataExtractor.extract)
          .mock.calls.map(([file]) => file.name),
      ).toEqual(['fresh-a.mp4', 'fresh-b.mp4'])

      controlled.release('fresh-a.mp4')
      await Promise.resolve()
      expect(metadataExtractor.extract).toHaveBeenCalledTimes(2)

      controlled.release('fresh-b.mp4')
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(3),
      )
      expect(vi.mocked(metadataExtractor.extract).mock.calls[2]?.[0].name).toBe(
        'retry.mp4',
      )
    } finally {
      controlled.releaseAll()
      await collection
    }
  })

  test('deduplicates identified IDs before decode, persistence, and registration', async () => {
    const first = new File(['same'], 'same.mp4', { type: 'video/mp4' })
    const duplicate = new File(['same'], 'same-copy.mp4', {
      type: 'video/mp4',
    })
    const { useCase, metadataExtractor, aggregateRepository, sessionRegistry } =
      createHarness({
        metadataExtractor: {
          generateId: vi.fn(async () => 'same-id'),
        },
      })

    const events = await collect(
      useCase.execute([{ file: first }, { file: duplicate }], {
        concurrency: 2,
      }),
    )
    const videos = events.filter(
      (event): event is Extract<VideoIngestionEvent, { type: 'video' }> =>
        event.type === 'video',
    )
    const finalProgress = events
      .filter(
        (event): event is Extract<VideoIngestionEvent, { type: 'progress' }> =>
          event.type === 'progress',
      )
      .at(-1)?.progress

    expect(metadataExtractor.extract).toHaveBeenCalledOnce()
    expect(aggregateRepository.postVideo).toHaveBeenCalledOnce()
    expect(sessionRegistry.registerFile).toHaveBeenCalledOnce()
    expect(sessionRegistry.registerFile).toHaveBeenCalledWith('same-id', first)
    expect(videos).toHaveLength(1)
    expect(finalProgress).toEqual(
      expect.objectContaining({
        duplicateCount: 1,
        completedCount: 2,
        total: 2,
        phase: 'complete',
      }),
    )
  })

  test.each([
    { requested: 1, expected: 1 },
    { requested: 4, expected: 4 },
    { requested: 99, expected: 4 },
  ])(
    'runs actual extraction work at the normalized $expected-job limit for $requested',
    async ({ requested, expected }) => {
      const files = ['one.mp4', 'two.mp4', 'three.mp4', 'four.mp4'].map(
        (name) => new File([name], name, { type: 'video/mp4' }),
      )
      const controlled = createControlledExtraction()
      const { useCase, metadataExtractor } = createHarness({
        metadataExtractor: { extract: controlled.extract },
      })
      const collection = collect(
        useCase.execute(
          files.map((file) => ({ file })),
          { concurrency: requested },
        ),
      )

      try {
        await vi.waitFor(() =>
          expect(metadataExtractor.extract).toHaveBeenCalledTimes(expected),
        )
        await Promise.resolve()

        expect(metadataExtractor.extract).toHaveBeenCalledTimes(expected)
        expect(controlled.maxActiveCount).toBe(expected)
      } finally {
        controlled.releaseAll()
        await collection
      }
    },
  )

  test('refills a processing slot after one item fails', async () => {
    const files = ['one.mp4', 'two.mp4', 'three.mp4'].map(
      (name) => new File([name], name, { type: 'video/mp4' }),
    )
    let rejectFirst: ((reason?: unknown) => void) | undefined
    let resolveSecond:
      | ((value: {
          videoEntity: ReturnType<typeof buildVideoEntity>
          url: string
        }) => void)
      | undefined
    const extractionResult = (id: string, title: string) => ({
      videoEntity: buildVideoEntity({ id, title }),
      url: '',
    })
    const extract = vi.fn<IVideoMetadataExtractor['extract']>(
      (file, options) => {
        if (file.name === 'one.mp4') {
          return new Promise((_resolve, reject) => {
            rejectFirst = reject
          })
        }

        if (file.name === 'two.mp4') {
          return new Promise((resolve) => {
            resolveSecond = resolve
          })
        }

        return Promise.resolve(
          extractionResult(options?.idHint ?? 'id-three.mp4', file.name),
        )
      },
    )
    const { useCase, metadataExtractor } = createHarness({
      metadataExtractor: { extract },
    })
    const collection = collect(
      useCase.execute(
        files.map((file) => ({ file })),
        { concurrency: 2 },
      ),
    )

    try {
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(2),
      )
      rejectFirst?.(new Error('decode failed'))
      await vi.waitFor(() =>
        expect(metadataExtractor.extract).toHaveBeenCalledTimes(3),
      )
      resolveSecond?.(extractionResult('id-two.mp4', 'two.mp4'))

      const events = await collection
      const finalProgress = events
        .filter(
          (
            event,
          ): event is Extract<VideoIngestionEvent, { type: 'progress' }> =>
            event.type === 'progress',
        )
        .at(-1)?.progress

      expect(finalProgress).toEqual(
        expect.objectContaining({
          completedCount: 3,
          createdCount: 2,
          failedCount: 1,
          phase: 'complete',
        }),
      )
    } finally {
      rejectFirst?.(new Error('test cleanup'))
      resolveSecond?.(extractionResult('id-two.mp4', 'two.mp4'))
      await collection
    }
  })

  test('never reports a pending count above the recorded pending peak', async () => {
    const files = ['one.mp4', 'two.mp4', 'three.mp4'].map(
      (name) => new File([name], name, { type: 'video/mp4' }),
    )
    const { useCase } = createHarness()
    const events = await collect(
      useCase.execute(
        files.map((file) => ({ file })),
        { concurrency: 4 },
      ),
    )
    const progressEvents = events.filter(
      (event): event is Extract<VideoIngestionEvent, { type: 'progress' }> =>
        event.type === 'progress',
    )

    progressEvents.forEach(({ progress }) => {
      expect(progress.peakPendingItemCount ?? 0).toBeGreaterThanOrEqual(
        progress.pendingItemCount ?? 0,
      )
    })
  })
})
