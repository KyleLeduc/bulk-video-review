import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'

describe('VideoCard', () => {
  test('wraps media inside a fixed landscape frame', () => {
    const video = buildParsedVideo({ id: 'id-1', thumbUrls: [] })
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(VideoCard, {
      props: {
        video,
      },
      global,
      shallow: true,
    })

    const mediaFrame = wrapper.get('.cardMedia')
    expect(mediaFrame.find('.thumb').exists()).toBe(true)
  })

  test('shows hover arming feedback before thumbnail generation starts', async () => {
    vi.useFakeTimers()

    try {
      const video = buildParsedVideo({ id: 'id-1', thumbUrls: [] })
      const { global } = createPresentationTestContext({
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(VideoCard, {
        props: {
          video,
        },
        global,
        shallow: true,
      })

      const store = useVideoStore()
      store.addVideos([video])

      await wrapper.get('img.thumb').trigger('mouseenter')
      await vi.advanceTimersByTimeAsync(100)

      expect(wrapper.classes()).toContain('card--hover-arming')
      const ring = wrapper.get('.thumbnail-activity-ring')
      expect(ring.classes()).toContain('thumbnail-activity-ring--hover')
      expect(ring.attributes('style')).toContain('--ring-progress')
    } finally {
      vi.useRealTimers()
    }
  })

  test('does not start thumbnail generation until hover dwell completes', async () => {
    vi.useFakeTimers()

    try {
      const video = buildParsedVideo({ id: 'id-1', thumbUrls: [] })
      const { global, mocks } = createPresentationTestContext({
        useCases: {
          updateThumbUseCase: {
            execute: vi.fn(
              () =>
                new Promise(() => {
                  // Keep the job in-flight so the active state is observable.
                }),
            ),
          },
        },
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(VideoCard, {
        props: {
          video,
        },
        global,
        shallow: true,
      })

      const store = useVideoStore()
      store.addVideos([video])

      await wrapper.get('img.thumb').trigger('mouseenter')

      await vi.advanceTimersByTimeAsync(200)
      expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(60)
      expect(mocks.useCases.updateThumbUseCase.execute).toHaveBeenCalledTimes(1)
      expect(wrapper.classes()).toContain('card--thumbnail-active')
      const ring = wrapper.get('.thumbnail-activity-ring')
      expect(ring.classes()).toContain('thumbnail-activity-ring--active')
      expect(ring.classes()).not.toContain('thumbnail-activity-ring--hover')
    } finally {
      vi.useRealTimers()
    }
  })
})
