import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useAppStateStore, useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'
import DiagnosticsPanel from './DiagnosticsPanel.vue'
import diagnosticsPanelSource from './DiagnosticsPanel.vue?raw'

const diagnosticsPanelStyles =
  diagnosticsPanelSource.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ''

describe('DiagnosticsPanel', () => {
  test('shows focus pause explicitly and routes database wipe through queue cancellation', async () => {
    const { global, mocks } = createPresentationTestContext()
    const wrapper = mount(DiagnosticsPanel, { global })
    const store = useVideoStore()
    useAppStateStore().toggleDiagnosticsPanel(true)
    store.setPreviewProcessingPaused(true)
    await nextTick()
    expect(wrapper.text()).toContain('Paused until focus returns')
    const wipe = vi.spyOn(store, 'wipeVideoData')
    await wrapper.get('[data-testid="wipe-database"]').trigger('click')
    await flushPromises()
    expect(wipe).toHaveBeenCalledOnce()
    expect(mocks.useCases.wipeVideoDataUseCase.execute).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    styleElement = document.createElement('style')
    styleElement.textContent = diagnosticsPanelStyles
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    styleElement.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('defines a viewport-fixed layer between app chrome and global status UI', async () => {
    const { global } = createPresentationTestContext()
    const wrapper = mount(DiagnosticsPanel, {
      attachTo: document.body,
      global,
    })

    useAppStateStore().toggleDiagnosticsPanel(true)
    await nextTick()

    const styles = window.getComputedStyle(wrapper.get('.panel').element)
    expect(styles.position).toBe('fixed')
    expect(styles.top).toBe('0px')
    expect(styles.right).toBe('0px')
    expect(styles.bottom).toBe('0px')
    expect(Number(styles.zIndex)).toBeGreaterThan(20)
    expect(Number(styles.zIndex)).toBeLessThan(30)
    wrapper.unmount()
  })

  test('defines independent scrolling and width containment', async () => {
    const { global } = createPresentationTestContext()
    const wrapper = mount(DiagnosticsPanel, {
      attachTo: document.body,
      global,
    })

    useAppStateStore().toggleDiagnosticsPanel(true)
    await nextTick()

    const panelStyles = window.getComputedStyle(wrapper.get('.panel').element)
    const selectStyles = window.getComputedStyle(
      wrapper.get('#ingestionConcurrency').element,
    )
    expect(panelStyles.overflowY).toBe('auto')
    expect(panelStyles.overflowX).toBe('hidden')
    expect(panelStyles.boxSizing).toBe('border-box')
    expect(panelStyles.maxWidth).toBe('100%')
    expect(selectStyles.boxSizing).toBe('border-box')
    wrapper.unmount()
  })

  test('does not build reports for phase updates while closed and refreshes on reopen', async () => {
    let durationMs = 10
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* (_items, options) {
            options?.onTiming?.({
              videoId: 'id',
              phase: 'metadata',
              durationMs,
              outcome: 'completed',
            })
            yield* []
          }),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    const store = useVideoStore()
    const buildReport = vi.spyOn(store, 'createDisplayedIngestionRunReport')
    const file = new File(['v'], 'v.mp4', { type: 'video/mp4' })
    await store.addVideosFromFiles(createMockFileList(file))
    await nextTick()
    expect(buildReport).not.toHaveBeenCalled()
    useAppStateStore().toggleDiagnosticsPanel(true)
    await nextTick()
    expect(wrapper.get('[data-testid="phase-metadata"]').text()).toContain(
      '10.00 ms',
    )
    useAppStateStore().toggleDiagnosticsPanel(false)
    await nextTick()
    buildReport.mockClear()
    durationMs = 25
    await store.addVideosFromFiles(createMockFileList(file))
    await nextTick()
    expect(buildReport).not.toHaveBeenCalled()
    useAppStateStore().toggleDiagnosticsPanel(true)
    await nextTick()
    expect(wrapper.get('[data-testid="phase-metadata"]').text()).toContain(
      '25.00 ms',
    )
    wrapper.unmount()
  })

  test('shows queued import and paused thumbnail drain state', async () => {
    vi.useFakeTimers()

    try {
      let addCallCount = 0
      let thumbnailCallCount = 0
      let resolveThumbnailJob:
        | ((video: ReturnType<typeof buildParsedVideo>) => void)
        | undefined

      const { global } = createPresentationTestContext({
        useCases: {
          addVideosUseCase: {
            execute: vi.fn(async function* () {
              addCallCount += 1

              if (addCallCount === 1) {
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
                  },
                }
                return
              }

              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-2', thumbUrls: [] }),
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
                },
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn((video: ReturnType<typeof buildParsedVideo>) => {
              thumbnailCallCount += 1
              if (thumbnailCallCount === 1) {
                return new Promise<ReturnType<typeof buildParsedVideo>>(
                  (resolve) => {
                    resolveThumbnailJob = resolve
                  },
                )
              }

              return Promise.resolve(
                buildParsedVideo({
                  ...video,
                  thumbUrls: ['thumb-1', 'thumb-2'],
                }),
              )
            }),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
        (type: string) => (type === 'video/mp4' ? 'probably' : ''),
      )

      const wrapper = mount(DiagnosticsPanel, {
        global,
      })

      const appStateStore = useAppStateStore()
      appStateStore.toggleDiagnosticsPanel(true)

      const videoStore = useVideoStore()
      videoStore.setThumbnailConcurrencyOverride(1)

      await videoStore.addVideosFromFiles(
        createMockFileList(
          new File(['video-bytes'], 'batch-a.mp4', { type: 'video/mp4' }),
        ),
      )
      await vi.advanceTimersByTimeAsync(200)

      const queuedImport = videoStore.addVideosFromFiles(
        createMockFileList(
          new File(['video-bytes'], 'batch-b.mp4', { type: 'video/mp4' }),
        ),
      )
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()

      expect(wrapper.text()).toContain('Queued imports')
      expect(wrapper.text()).toContain('1')
      expect(wrapper.text()).toContain('Thumbnail drain paused')

      resolveThumbnailJob?.(
        buildParsedVideo({
          id: 'id-1',
          thumbUrls: ['thumb-1', 'thumb-2'],
        }),
      )
      await flushPromises()
      await queuedImport
      await vi.advanceTimersByTimeAsync(200)
      await flushPromises()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  test('shows the latest completed run and separate foreground and background job controls', async () => {
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* (_items, options) {
            options?.onTiming?.({
              videoId: 'private-id',
              phase: 'metadata',
              durationMs: 12.5,
              outcome: 'completed',
            })
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
                peakActiveItemCount: 1,
                peakPendingItemCount: 0,
                skippedCount: 0,
                duplicateCount: 0,
                elapsedMs: 25,
              },
            }
          }),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    const appStateStore = useAppStateStore()
    const videoStore = useVideoStore()
    appStateStore.toggleDiagnosticsPanel(true)

    await videoStore.addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )
    await nextTick()

    expect(videoStore.activeIngestionSession).toBeNull()
    expect(wrapper.text()).toContain('Foreground ingestion')
    expect(wrapper.text()).toContain('Background previews')
    expect(wrapper.text()).toContain('Complete')
    expect(wrapper.text()).toContain('DOM (workers disabled)')
    expect(wrapper.text()).toContain(
      'Summed operation time, not pipeline wall time',
    )
    expect(wrapper.find('[data-testid="phase-metadata"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="phase-metadata"]').text()).toContain(
      '12.50 ms',
    )
    expect(wrapper.text()).toContain('Peak active jobs')
    expect(wrapper.text()).toContain('Worker limit')
    expect(wrapper.text()).toContain('Primary ingestion workers')
    expect(wrapper.text()).toContain('Applies to the next import')
    expect(wrapper.get('[data-testid="foreground-workers-used"]').text()).toBe(
      '2',
    )
    expect(wrapper.get('[data-testid="thumbnail-workers-used"]').text()).toBe(
      '1',
    )
    expect(wrapper.text()).toContain('Thumbnail workers')
    expect(wrapper.text()).toContain('Runs after primary ingestion')
    expect(
      wrapper.get('[data-testid="foreground-average-per-video"]').text(),
    ).toBe('0.03 s/video')
    expect(
      wrapper.get('[data-testid="foreground-videos-per-second"]').text(),
    ).toBe('40.00 videos/s')

    const foregroundSelect = wrapper.get('#ingestionConcurrency')
    const backgroundSelect = wrapper.get('#thumbnailConcurrency')
    expect(
      foregroundSelect.findAll('option').map((option) => option.text()),
    ).toEqual(['Auto (2)', '1', '2', '3', '4'])
    expect(
      backgroundSelect.findAll('option').map((option) => option.text()),
    ).toEqual(['Auto (1)', '1', '2', '3', '4'])

    await foregroundSelect.setValue('4')
    await backgroundSelect.setValue('4')
    expect(videoStore.ingestionConcurrencyOverride).toBe(4)
    expect(videoStore.thumbnailConcurrencyOverride).toBe(4)
  })

  test('shows completed thumbnail throughput and average wall time per video', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    let resolvePreview:
      | ((video: ReturnType<typeof buildParsedVideo>) => void)
      | undefined
    const { global } = createPresentationTestContext({
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
                elapsedMs: 100,
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            () =>
              new Promise<ReturnType<typeof buildParsedVideo>>((resolve) => {
                resolvePreview = resolve
              }),
          ),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    useAppStateStore().toggleDiagnosticsPanel(true)

    await useVideoStore().addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )
    await vi.advanceTimersByTimeAsync(150)
    await vi.advanceTimersByTimeAsync(1000)
    resolvePreview?.(
      buildParsedVideo({
        id: 'id-1',
        thumbUrls: ['thumb-1', 'thumb-2'],
      }),
    )
    await flushPromises()
    await nextTick()

    expect(
      wrapper.get('[data-testid="thumbnail-average-per-video"]').text(),
    ).toBe('1.00 s/video')
    expect(
      wrapper.get('[data-testid="thumbnail-videos-per-second"]').text(),
    ).toBe('1.00 videos/s')
  })

  test('copies the displayed report while always keeping readable JSON available', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      userAgent: 'diagnostics-test',
      hardwareConcurrency: 8,
      clipboard: { writeText },
    })
    const { global } = createPresentationTestContext({
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
                elapsedMs: 10,
              },
            }
          }),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    useAppStateStore().toggleDiagnosticsPanel(true)
    const videoStore = useVideoStore()
    await videoStore.addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'private-name.mp4', { type: 'video/mp4' }),
      ),
    )
    await nextTick()

    const reportTextarea = wrapper.get<HTMLTextAreaElement>(
      '[data-testid="ingestion-report-json"]',
    )
    const reportJson = reportTextarea.element.value
    expect(JSON.parse(reportJson)).toEqual(
      expect.objectContaining({ schemaVersion: 1 }),
    )
    expect(reportJson).not.toContain('private-name')

    await wrapper.get('[data-testid="copy-ingestion-report"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(reportJson)
    expect(wrapper.get('[role="status"]').text()).toContain('Report copied')
    expect(reportTextarea.element.readOnly).toBe(true)

    await videoStore.addVideosFromFiles(
      createMockFileList(
        new File(['next-video'], 'next.mp4', { type: 'video/mp4' }),
      ),
    )
    await nextTick()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  test('clears copy feedback when progress changes the current run report', async () => {
    let releaseFinalProgress: (() => void) | undefined
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      userAgent: 'diagnostics-test',
      hardwareConcurrency: 8,
      clipboard: { writeText },
    })
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 0,
                existingCount: 0,
                newCount: 0,
                knownErrorCount: 0,
                createdCount: 0,
                failedCount: 0,
                completedCount: 0,
                phase: 'identifying' as const,
              },
            }
            await new Promise<void>((resolve) => {
              releaseFinalProgress = resolve
            })
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 1,
                newCount: 0,
                knownErrorCount: 0,
                createdCount: 0,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
              },
            }
          }),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    useAppStateStore().toggleDiagnosticsPanel(true)
    const ingestion = useVideoStore().addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )
    await flushPromises()

    await wrapper.get('[data-testid="copy-ingestion-report"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Report copied')

    releaseFinalProgress?.()
    await ingestion
    await nextTick()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  test('keeps manual-copy JSON visible when the Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'diagnostics-test',
      hardwareConcurrency: 4,
    })
    const { global } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield {
              type: 'progress' as const,
              progress: {
                total: 1,
                scanned: 1,
                existingCount: 1,
                newCount: 0,
                knownErrorCount: 0,
                createdCount: 0,
                failedCount: 0,
                completedCount: 1,
                phase: 'complete' as const,
              },
            }
          }),
        },
      },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(DiagnosticsPanel, { global })
    useAppStateStore().toggleDiagnosticsPanel(true)
    await useVideoStore().addVideosFromFiles(
      createMockFileList(
        new File(['video'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )
    await nextTick()

    await wrapper.get('[data-testid="copy-ingestion-report"]').trigger('click')

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Clipboard unavailable',
    )
    expect(
      wrapper.get<HTMLTextAreaElement>('[data-testid="ingestion-report-json"]')
        .element.value,
    ).toContain('"schemaVersion": 1')
  })
})
