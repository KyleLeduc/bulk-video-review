import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { VideoPreviewGenerationOptions } from '@app/ports'
import type { VideoIngestionOptions } from '@app/usecases/VideoIngestionUseCase'
import type { ParsedVideo } from '@domain/entities'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'

const StoreHarness = defineComponent({
  name: 'IngestionSchedulerStoreHarness',
  setup() {
    return { store: useVideoStore() }
  },
  template: '<div />',
})

const mountStore = (
  context: ReturnType<typeof createPresentationTestContext>,
) => {
  const wrapper = mount(StoreHarness, { global: context.global })
  return (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
}

const expectPrimitiveTree = (value: unknown): void => {
  if (
    value === null ||
    ['boolean', 'number', 'string'].includes(typeof value)
  ) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach(expectPrimitiveTree)
    return
  }

  expect(typeof value).toBe('object')
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
  Object.values(value as Record<string, unknown>).forEach(expectPrimitiveTree)
}

describe('useVideoStore ingestion scheduler', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('keeps phase work in its execution session, detached from queue time and late callbacks', async () => {
    vi.useFakeTimers()
    let releaseFirst: () => void = () => {}
    const callbacks: Array<VideoIngestionOptions['onTiming']> = []
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* (_items, options) {
            callbacks.push(options?.onTiming)
            if (callbacks.length === 1)
              await new Promise<void>((resolve) => {
                releaseFirst = resolve
              })
            options?.onTiming?.({
              videoId: 'private-id',
              phase: 'metadata',
              durationMs: callbacks.length * 7,
              outcome: 'completed',
            })
            yield* []
          }),
        },
      },
    })
    const store = mountStore(context)
    const file = new File(['video'], 'private.mp4', { type: 'video/mp4' })
    const first = store.addVideosFromFiles(createMockFileList(file))
    await flushPromises()
    const second = store.addVideosFromFiles(createMockFileList(file))
    await vi.advanceTimersByTimeAsync(100)
    releaseFirst()
    await first
    await second
    const firstReport = store.createIngestionRunReport('ingestion-1')!
    const secondReport = store.createIngestionRunReport('ingestion-2')!
    expect(firstReport).toHaveProperty('measurements')
    expect(firstReport.measurements.foreground.metadata).toEqual({
      count: 1,
      completed: 1,
      failed: 0,
      aborted: 0,
      totalMs: 7,
      maxMs: 7,
    })
    expect(secondReport.measurements.foreground.metadata?.totalMs).toBe(14)
    expect(secondReport.timing.queueWaitMs).toBe(100)
    expect(secondReport.measurements).toMatchObject({
      version: 1,
      backend: 'dom',
      workersEnabled: false,
      fallbackReason: null,
      foregroundCancellationSupported: false,
    })
    const saved = JSON.stringify(store.createIngestionRunReport('ingestion-1'))
    callbacks[0]?.({
      videoId: 'private-id',
      phase: 'encode',
      durationMs: 999,
      outcome: 'completed',
    })
    firstReport.measurements.foreground.metadata!.totalMs = 999
    expect(JSON.stringify(store.createIngestionRunReport('ingestion-1'))).toBe(
      saved,
    )
    expect(JSON.stringify(secondReport)).not.toContain('private')
  })

  test('uses two foreground jobs by default and clamps manual settings to one through four', async () => {
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield* []
          }),
        },
      },
    })
    const store = mountStore(context)
    const first = new File(['one'], 'one.mp4', { type: 'video/mp4' })
    const second = new File(['two'], 'two.mp4', { type: 'video/mp4' })

    expect((store as any).autoIngestionConcurrency).toBe(2)
    expect((store as any).effectiveIngestionConcurrency).toBe(2)

    await store.addVideosFromFiles(createMockFileList(first))
    expect(
      context.mocks.useCases.addVideosUseCase.execute,
    ).toHaveBeenNthCalledWith(1, [{ file: first }], {
      concurrency: 2,
      onTiming: expect.any(Function),
      onUnavailable: expect.any(Function),
    })
    ;(store as any).setIngestionConcurrencyOverride(99)
    expect((store as any).effectiveIngestionConcurrency).toBe(4)

    await store.addVideosFromFiles(createMockFileList(second))
    expect(
      context.mocks.useCases.addVideosUseCase.execute,
    ).toHaveBeenNthCalledWith(2, [{ file: second }], {
      concurrency: 4,
      onTiming: expect.any(Function),
      onUnavailable: expect.any(Function),
    })
    ;(store as any).setIngestionConcurrencyOverride(0)
    expect((store as any).effectiveIngestionConcurrency).toBe(1)
    ;(store as any).setIngestionConcurrencyOverride(null)
    expect((store as any).effectiveIngestionConcurrency).toBe(2)
  })

  test('preserves the foreground setting captured when a batch enters the FIFO queue', async () => {
    let releaseFirst: (() => void) | undefined
    let callCount = 0
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            callCount += 1
            if (callCount === 1) {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve
              })
            }
            yield* []
          }),
        },
      },
    })
    const store = mountStore(context)
    const first = new File(['one'], 'one.mp4', { type: 'video/mp4' })
    const second = new File(['two'], 'two.mp4', { type: 'video/mp4' })
    const firstRun = store.addVideosFromFiles(createMockFileList(first))

    try {
      await vi.waitFor(() =>
        expect(
          context.mocks.useCases.addVideosUseCase.execute,
        ).toHaveBeenCalledTimes(1),
      )
      ;(store as any).setIngestionConcurrencyOverride(1)
      const secondRun = store.addVideosFromFiles(createMockFileList(second))
      ;(store as any).setIngestionConcurrencyOverride(4)

      releaseFirst?.()
      await firstRun
      await secondRun

      expect(
        context.mocks.useCases.addVideosUseCase.execute,
      ).toHaveBeenNthCalledWith(2, [{ file: second }], {
        concurrency: 1,
        onTiming: expect.any(Function),
        onUnavailable: expect.any(Function),
      })
    } finally {
      releaseFirst?.()
      await firstRun
    }
  })

  test('builds a primitive run report from accepted input and final foreground progress', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 0,
                newCount: 1,
                knownErrorCount: 0,
                createdCount: 1,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
                effectiveConcurrency: 2,
                activeItemCount: 0,
                pendingItemCount: 0,
                phaseCompletedCount: 1,
                phaseTotal: 1,
                peakActiveItemCount: 1,
                peakPendingItemCount: 0,
                inputBytes: 8,
                identificationElapsedMs: 12,
                classificationElapsedMs: 8,
                processingElapsedMs: 30,
                elapsedMs: 50,
                skippedCount: 0,
                duplicateCount: 0,
              },
            }
          }),
        },
      },
    })
    const store = mountStore(context)
    const playable = new File(['accepted'], 'private-name.mp4', {
      type: 'video/mp4',
    })
    const unsupported = new File(['unsupported'], 'private-name.mov', {
      type: 'video/quicktime',
    })

    await store.addVideosFromFiles(createMockFileList(playable, unsupported))

    store.setIngestionConcurrencyOverride(4)
    store.setThumbnailConcurrencyOverride(2)
    const report = (store as any).createDisplayedIngestionRunReport()

    expect(report).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        status: 'completed',
        input: {
          selectedCount: 2,
          acceptedCount: 1,
          unsupportedCount: 1,
          acceptedBytes: playable.size,
        },
        foreground: expect.objectContaining({
          phase: 'complete',
          concurrency: {
            mode: 'auto',
            requested: null,
            effective: 2,
            peakActiveJobs: 1,
          },
          counts: expect.objectContaining({
            total: 1,
            created: 1,
            failed: 0,
            skipped: 0,
            duplicates: 0,
          }),
          timings: {
            identificationMs: 12,
            classificationMs: 8,
            processingMs: 30,
            totalMs: 50,
            averageMsPerCompletedVideo: 50,
            completedVideosPerSecond: 20,
          },
        }),
        backgroundPreviews: expect.objectContaining({
          concurrency: {
            mode: 'auto',
            requested: null,
            effective: 2,
          },
        }),
      }),
    )
    expect(JSON.stringify(report)).not.toContain('private-name')
    expectPrimitiveTree(report)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  test('separates foreground completion from run-scoped preview completion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    let resolvePreview: ((video: ParsedVideo) => void) | undefined
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
            }
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 0,
                newCount: 1,
                knownErrorCount: 0,
                createdCount: 1,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
                effectiveConcurrency: 2,
                activeItemCount: 0,
                pendingItemCount: 0,
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            () =>
              new Promise<ParsedVideo>((resolve) => {
                resolvePreview = resolve
              }),
          ),
        },
      },
    })
    const store = mountStore(context)
    const file = new File(['accepted'], 'sample.mp4', {
      type: 'video/mp4',
    })

    await store.addVideosFromFiles(createMockFileList(file))

    expect((store as any).createDisplayedIngestionRunReport()).toEqual(
      expect.objectContaining({
        status: 'thumbnailing',
        timing: expect.objectContaining({
          foregroundCompletedAtMs: Date.now(),
          pipelineCompletedAtMs: null,
        }),
      }),
    )

    await vi.advanceTimersByTimeAsync(200)
    vi.setSystemTime(new Date('2026-08-22T12:00:00.250Z'))
    resolvePreview?.(
      buildParsedVideo({
        id: 'id-1',
        thumbUrls: Array.from(
          { length: 9 },
          (_, index) => 'thumb-' + (index + 1),
        ),
      }),
    )
    await flushPromises()

    expect((store as any).createDisplayedIngestionRunReport()).toEqual(
      expect.objectContaining({
        status: 'completed',
        timing: expect.objectContaining({
          foregroundCompletedAtMs: Date.parse('2026-08-22T12:00:00.000Z'),
          pipelineCompletedAtMs: Date.parse('2026-08-22T12:00:00.250Z'),
        }),
        backgroundPreviews: expect.objectContaining({
          counts: expect.objectContaining({
            total: 1,
            ready: 1,
            failed: 0,
          }),
          peakActiveJobs: 1,
          outputBytes: 0,
          timing: expect.objectContaining({
            averageMsPerCompletedVideo: 100,
            completedVideosPerSecond: 10,
          }),
        }),
      }),
    )
  })

  test('excludes foreground interruption gaps from thumbnail processing metrics', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    let ingestionCallCount = 0
    let thumbnailCallCount = 0
    let resolveResumedPreview: ((video: ParsedVideo) => void) | undefined
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            ingestionCallCount += 1
            const isFirstIngestion = ingestionCallCount === 1
            if (isFirstIngestion) {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
              }
            }

            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: isFirstIngestion ? 0 : 1,
                newCount: isFirstIngestion ? 1 : 0,
                knownErrorCount: 0,
                createdCount: isFirstIngestion ? 1 : 0,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
                elapsedMs: 10,
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo, options?: VideoPreviewGenerationOptions) => {
              thumbnailCallCount += 1
              if (thumbnailCallCount === 1) {
                return new Promise<ParsedVideo>((_resolve, reject) => {
                  const rejectAsAborted = () => {
                    const error = new Error('Preview generation interrupted')
                    error.name = 'AbortError'
                    reject(error)
                  }

                  if (options?.signal?.aborted) {
                    rejectAsAborted()
                  } else {
                    options?.signal?.addEventListener(
                      'abort',
                      rejectAsAborted,
                      { once: true },
                    )
                  }
                })
              }

              return new Promise<ParsedVideo>((resolve) => {
                resolveResumedPreview = resolve
              })
            },
          ),
        },
      },
    })
    const store = mountStore(context)

    await store.addVideosFromFiles(
      createMockFileList(
        new File(['first'], 'first.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(150)
    await vi.advanceTimersByTimeAsync(100)

    const secondIngestion = store.addVideosFromFiles(
      createMockFileList(
        new File(['second'], 'second.mp4', { type: 'video/mp4' }),
      ),
    )
    await flushPromises()
    await secondIngestion
    await vi.advanceTimersByTimeAsync(150)
    await vi.advanceTimersByTimeAsync(100)
    resolveResumedPreview?.(
      buildParsedVideo({
        id: 'id-1',
        thumbUrls: Array.from(
          { length: 9 },
          (_, index) => 'thumb-' + (index + 1),
        ),
      }),
    )
    await flushPromises()

    expect((store as any).createIngestionRunReport('ingestion-1')).toEqual(
      expect.objectContaining({
        backgroundPreviews: expect.objectContaining({
          timing: expect.objectContaining({
            elapsedMs: 350,
            activeElapsedMs: 200,
            averageMsPerCompletedVideo: 200,
            completedVideosPerSecond: 5,
          }),
        }),
      }),
    )
  })

  test('completes every owning ingestion session when a repeated video shares a requeued preview job', async () => {
    vi.useFakeTimers()
    let previewCallCount = 0
    const callbacks: Array<VideoPreviewGenerationOptions['onTiming']> = []
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
            }
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 0,
                newCount: 1,
                knownErrorCount: 0,
                createdCount: 1,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo, options?: VideoPreviewGenerationOptions) => {
              previewCallCount += 1
              callbacks.push(options?.onTiming)
              if (previewCallCount === 1) {
                return new Promise<ParsedVideo>((_resolve, reject) => {
                  const rejectAsAborted = () => {
                    options?.onTiming?.({
                      phase: 'encode',
                      durationMs: 5,
                      outcome: 'aborted',
                    })
                    const error = new Error('Preview generation interrupted')
                    error.name = 'AbortError'
                    reject(error)
                  }

                  if (options?.signal?.aborted) {
                    rejectAsAborted()
                  } else {
                    options?.signal?.addEventListener(
                      'abort',
                      rejectAsAborted,
                      { once: true },
                    )
                  }
                })
              }

              options?.onTiming?.({
                phase: 'encode',
                durationMs: 12,
                outcome: 'completed',
              })
              return Promise.resolve(
                buildParsedVideo({
                  ...video,
                  thumbUrls: Array.from(
                    { length: 9 },
                    (_, index) => 'thumb-' + (index + 1),
                  ),
                }),
              )
            },
          ),
        },
      },
    })
    const store = mountStore(context)

    await store.addVideosFromFiles(
      createMockFileList(
        new File(['first'], 'first.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(200)
    expect(
      context.mocks.useCases.updateThumbUseCase.execute,
    ).toHaveBeenCalledTimes(1)

    const secondRun = store.addVideosFromFiles(
      createMockFileList(
        new File(['second'], 'second.mp4', { type: 'video/mp4' }),
      ),
    )
    await flushPromises()
    await secondRun
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    expect((store as any).createIngestionRunReport('ingestion-1')).toEqual(
      expect.objectContaining({
        status: 'completed',
        timing: expect.objectContaining({
          pipelineCompletedAtMs: expect.any(Number),
        }),
      }),
    )
    expect((store as any).createIngestionRunReport('ingestion-2')).toEqual(
      expect.objectContaining({
        status: 'completed',
        timing: expect.objectContaining({
          pipelineCompletedAtMs: expect.any(Number),
        }),
      }),
    )
    expect(
      store.createIngestionRunReport('ingestion-1')?.measurements,
    ).toMatchObject({
      previews: {
        encode: { count: 2, totalMs: 17, completed: 1, aborted: 1, failed: 0 },
      },
      previewAttempts: {
        started: 2,
        settled: 2,
        completed: 1,
        aborted: 1,
        failed: 0,
      },
    })
    expect(
      store.createIngestionRunReport('ingestion-2')?.measurements,
    ).toMatchObject({
      previews: { encode: { count: 1, totalMs: 12, completed: 1, aborted: 0 } },
      previewAttempts: {
        started: 1,
        settled: 1,
        completed: 1,
        aborted: 0,
        failed: 0,
      },
    })
    const before = JSON.stringify(store.createIngestionRunReport('ingestion-1'))
    callbacks.forEach((callback) =>
      callback?.({ phase: 'encode', durationMs: 999, outcome: 'completed' }),
    )
    expect(JSON.stringify(store.createIngestionRunReport('ingestion-1'))).toBe(
      before,
    )
  })

  test('freezes a completed run preview report before later direct warmups', async () => {
    vi.useFakeTimers()
    let previewCallCount = 0
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'video' as const,
              video: buildParsedVideo({ id: 'id-1', thumbUrls: [] }),
            }
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 0,
                newCount: 1,
                knownErrorCount: 0,
                createdCount: 1,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo, options?: VideoPreviewGenerationOptions) => {
              previewCallCount += 1
              options?.onTiming?.({
                phase: 'seek',
                durationMs: 50,
                outcome: previewCallCount === 1 ? 'failed' : 'completed',
              })
              return Promise.resolve(
                previewCallCount === 1
                  ? video
                  : buildParsedVideo({
                      ...video,
                      thumbUrls: Array.from(
                        { length: 9 },
                        (_, index) => 'thumb-' + (index + 1),
                      ),
                    }),
              )
            },
          ),
        },
      },
    })
    const store = mountStore(context)

    await store.addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    const completedReport = (store as any).createDisplayedIngestionRunReport()
    expect(completedReport).toEqual(
      expect.objectContaining({
        status: 'completed',
        backgroundPreviews: expect.objectContaining({
          counts: expect.objectContaining({ failed: 1 }),
        }),
      }),
    )
    const completedReportJson = JSON.stringify(completedReport)
    expect(completedReport).toHaveProperty('measurements')
    expect(completedReport.measurements.previewAttempts).toEqual({
      started: 1,
      settled: 1,
      completed: 0,
      failed: 1,
      aborted: 0,
    })

    await store.updateVideoThumbnails('id-1')

    expect(
      JSON.stringify((store as any).createDisplayedIngestionRunReport()),
    ).toBe(completedReportJson)
  })

  test.each(['remove', 'clear'] as const)(
    'does not finalize a %s video run before its aborted attempt settles',
    async (action) => {
      vi.useFakeTimers()
      let rejectAttempt: (error: unknown) => void = () => {}
      let timing: VideoPreviewGenerationOptions['onTiming']
      const context = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'remove-me' }),
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn((_video, options) => {
              timing = options?.onTiming
              return new Promise<ParsedVideo>((_resolve, reject) => {
                rejectAttempt = reject
              })
            }),
          },
        },
      })
      const store = mountStore(context)
      await store.addVideosFromFiles(
        createMockFileList(new File(['v'], 'v.mp4', { type: 'video/mp4' })),
      )
      await vi.advanceTimersByTimeAsync(150)
      if (action === 'remove') store.removeVideo('remove-me')
      else store.removeAllUnpinned()
      expect(store.createDisplayedIngestionRunReport()?.status).toBe(
        'thumbnailing',
      )
      expect(
        store.createDisplayedIngestionRunReport()?.timing.pipelineCompletedAtMs,
      ).toBeNull()
      await vi.advanceTimersByTimeAsync(25)
      timing?.({ phase: 'encode', durationMs: 25, outcome: 'aborted' })
      rejectAttempt(new DOMException('removed', 'AbortError'))
      await flushPromises()
      const report = store.createDisplayedIngestionRunReport()!
      expect(report.status).toBe('completed')
      expect(report.measurements.previewAttempts).toEqual({
        started: 1,
        settled: 1,
        completed: 0,
        failed: 0,
        aborted: 1,
      })
      expect(report.timing.pipelineElapsedMs).toBe(175)
      const before = JSON.stringify(report)
      timing?.({ phase: 'encode', durationMs: 99, outcome: 'completed' })
      expect(JSON.stringify(store.createDisplayedIngestionRunReport())).toBe(
        before,
      )
    },
  )

  test('uses the background concurrency captured with the ingestion session', async () => {
    vi.useFakeTimers()
    const pending: Array<{
      video: ParsedVideo
      resolve: (video: ParsedVideo) => void
    }> = []
    const context = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            for (const id of ['id-1', 'id-2', 'id-3']) {
              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id, thumbUrls: [] }),
              }
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            (video: ParsedVideo) =>
              new Promise<ParsedVideo>((resolve) => {
                pending.push({ video, resolve })
              }),
          ),
        },
      },
    })
    const store = mountStore(context)
    store.setThumbnailConcurrencyOverride(1)
    const file = new File(['accepted'], 'sample.mp4', {
      type: 'video/mp4',
    })

    await store.addVideosFromFiles(createMockFileList(file))
    store.setThumbnailConcurrencyOverride(2)
    await vi.advanceTimersByTimeAsync(200)

    expect(
      context.mocks.useCases.updateThumbUseCase.execute,
    ).toHaveBeenCalledTimes(1)

    pending[0]?.resolve(
      buildParsedVideo({
        ...pending[0].video,
        thumbUrls: Array.from(
          { length: 9 },
          (_, index) => 'thumb-' + (index + 1),
        ),
      }),
    )
    await flushPromises()

    expect(
      context.mocks.useCases.updateThumbUseCase.execute,
    ).toHaveBeenCalledTimes(2)

    pending[1]?.resolve(
      buildParsedVideo({
        ...pending[1].video,
        thumbUrls: Array.from(
          { length: 9 },
          (_, index) => 'thumb-' + (index + 1),
        ),
      }),
    )
    await flushPromises()

    expect(
      context.mocks.useCases.updateThumbUseCase.execute,
    ).toHaveBeenCalledTimes(3)

    pending[2]?.resolve(
      buildParsedVideo({
        ...pending[2].video,
        thumbUrls: Array.from(
          { length: 9 },
          (_, index) => 'thumb-' + (index + 1),
        ),
      }),
    )
    await flushPromises()
  })
})
