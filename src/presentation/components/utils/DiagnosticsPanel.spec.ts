import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { useAppStateStore, useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'
import DiagnosticsPanel from './DiagnosticsPanel.vue'

describe('DiagnosticsPanel', () => {
  test('shows queued import and paused thumbnail drain state', async () => {
    vi.useFakeTimers()

    try {
      let addCallCount = 0
      let resolveThumbnailJob: ((video: ReturnType<typeof buildParsedVideo>) => void) | undefined

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
            execute: vi.fn(
              (video) =>
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

      void videoStore.addVideosFromFiles(
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
    } finally {
      vi.useRealTimers()
    }
  })
})
