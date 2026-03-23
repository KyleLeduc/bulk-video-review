import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'
import IngestionStatusToast from './IngestionStatusToast.vue'

describe('IngestionStatusToast', () => {
  test('renders a legend for the existing, new, and error meter colors', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    const legend = wrapper.get('.ingestion-toast__legend')
    expect(legend.text()).toContain('Existing')
    expect(legend.text()).toContain('New')
    expect(legend.text()).toContain('Error')
  })

  test('renders the queue summary and close button in a dedicated actions row', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    const actions = wrapper.get('.ingestion-toast__actions')
    expect(actions.find('.queue-summary').exists()).toBe(true)
    expect(actions.find('.ingestion-toast__close').exists()).toBe(true)
  })

  test('closes when the dismiss button is clicked', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

    await wrapper.get('.ingestion-toast__close').trigger('click')

    expect(wrapper.find('.ingestion-toast').exists()).toBe(false)
  })

  test('auto closes three seconds after ingestion finishes', async () => {
    vi.useFakeTimers()

    try {
      const { global } = createPresentationTestContext({
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      const store = useVideoStore()
      store.ingestionProgress = {
        total: 3,
        scanned: 3,
        existingCount: 1,
        newCount: 2,
        knownErrorCount: 0,
        createdCount: 1,
        failedCount: 0,
        completedCount: 1,
      }

      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      store.ingestionProgress = {
        ...store.ingestionProgress,
        completedCount: 3,
        createdCount: 2,
      }

      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(2999)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(1)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('shows a live elapsed time and freezes the completed duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'))

    try {
      const { global } = createPresentationTestContext({
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      const store = useVideoStore()
      ;(store as any).ingestionStartedAtMs = Date.now()
      ;(store as any).ingestionCompletedAtMs = null
      store.ingestionProgress = {
        total: 3,
        scanned: 3,
        existingCount: 1,
        newCount: 2,
        knownErrorCount: 0,
        createdCount: 1,
        failedCount: 0,
        completedCount: 1,
      }

      await nextTick()
      expect(wrapper.text()).toContain('Elapsed 0.0s')

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()
      expect(wrapper.text()).toContain('Elapsed 1.2s')
      ;(store as any).ingestionCompletedAtMs = Date.now()
      store.ingestionProgress = {
        ...store.ingestionProgress,
        completedCount: 3,
        createdCount: 2,
      }

      await nextTick()
      expect(wrapper.text()).toContain('Completed in 1.2s')

      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(wrapper.text()).toContain('Completed in 1.2s')
    } finally {
      vi.useRealTimers()
    }
  })

  test('keeps the toast visible until thumbnail generation finishes for the completed ingestion session', async () => {
    vi.useFakeTimers()

    try {
      let resolveThumbnailJob: (() => void) | undefined

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
                },
              }
            }),
          },
          updateThumbUseCase: {
            execute: vi.fn(
              (video) =>
                new Promise((resolve) => {
                  resolveThumbnailJob = () =>
                    resolve(
                      buildParsedVideo({
                        ...video,
                        thumbUrls: ['thumb-1', 'thumb-2'],
                      }),
                    )
                }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
        (type: string) => (type === 'video/mp4' ? 'probably' : ''),
      )

      const store = useVideoStore()
      await store.addVideosFromFiles(
        createMockFileList(
          new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' }),
        ),
      )

      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(3000)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      resolveThumbnailJob?.()
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()

      await vi.advanceTimersByTimeAsync(2999)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(1)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('switches the existing meter and labels to thumbnail progress after ingestion completes', async () => {
    let resolveThumbnailJob: (() => void) | undefined

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
              },
            }
          }),
        },
        updateThumbUseCase: {
          execute: vi.fn(
            (video) =>
              new Promise((resolve) => {
                resolveThumbnailJob = () =>
                  resolve(
                    buildParsedVideo({
                      ...video,
                      thumbUrls: ['thumb-1', 'thumb-2'],
                    }),
                  )
              }),
          ),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )

    const store = useVideoStore()
    await store.addVideosFromFiles(
      createMockFileList(
        new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' }),
      ),
    )

    await nextTick()

    expect(wrapper.text()).toContain('Thumbnail progress')
    expect(wrapper.text()).toContain('Generated 0 / 1')
    expect(wrapper.get('.ingestion-toast__legend').text()).toContain(
      'Generated',
    )
    expect(wrapper.get('.ingestion-toast__legend').text()).toContain('Pending')
    expect(wrapper.get('.ingestion-toast__legend').text()).toContain('Failed')
    expect(wrapper.get('.ingestion-toast__stats').text()).toContain('Pending 1')
    expect(wrapper.get('.segment--generated').attributes('style')).toContain(
      'width: 0%',
    )
    expect(wrapper.get('.segment--pending').attributes('style')).toContain(
      'width: 100%',
    )

    resolveThumbnailJob?.()
  })

  test('shows queued import context instead of mixing the meter with unrelated global thumbnail counts', async () => {
    vi.useFakeTimers()

    try {
      let addCallCount = 0
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
                  type: 'video' as const,
                  video: buildParsedVideo({ id: 'id-2', thumbUrls: [] }),
                }
                yield {
                  type: 'progress' as const,
                  progress: {
                    total: 2,
                    scanned: 2,
                    existingCount: 0,
                    newCount: 2,
                    knownErrorCount: 0,
                    createdCount: 2,
                    failedCount: 0,
                    completedCount: 2,
                  },
                }
                return
              }

              yield {
                type: 'video' as const,
                video: buildParsedVideo({ id: 'id-3', thumbUrls: [] }),
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
            execute: vi.fn(
              () =>
                new Promise((resolve) => {
                  resolveThumbnailJob = resolve
                }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
        (type: string) => (type === 'video/mp4' ? 'probably' : ''),
      )

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      const store = useVideoStore()
      store.setThumbnailConcurrencyOverride(1)

      await store.addVideosFromFiles(
        createMockFileList(
          new File(['video-bytes'], 'batch-a.mp4', { type: 'video/mp4' }),
        ),
      )
      await vi.advanceTimersByTimeAsync(200)

      void store.addVideosFromFiles(
        createMockFileList(
          new File(['video-bytes'], 'batch-b.mp4', { type: 'video/mp4' }),
        ),
      )
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()

      expect(wrapper.text()).toContain('Generated 0 / 2')
      expect(wrapper.text()).toContain('1 import queued')
      expect(wrapper.text()).toContain('Thumbnail drain paused')

      resolveThumbnailJob?.(
        buildParsedVideo({
          id: 'id-1',
          thumbUrls: ['thumb-1', 'thumb-2'],
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
