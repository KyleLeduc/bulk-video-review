import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'

describe('VideoCard', () => {
  test('renders the thumbnail inside the media frame by default', () => {
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

    const mediaFrame = wrapper.get('[data-testid="video-card-media-frame"]')
    expect(mediaFrame.find('.thumb').exists()).toBe(true)
  })

  test('keeps an accessible return to thumbnails while video is open', async () => {
    const video = buildParsedVideo({ id: 'id-1', thumbUrls: [] })
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })
    const wrapper = mount(VideoCard, {
      props: { video },
      global,
      shallow: true,
    })

    const openVideo = wrapper.get('[data-testid="video-view-toggle"]')
    expect(openVideo.element.tagName).toBe('BUTTON')
    expect(openVideo.attributes('aria-label')).toBe('Play video')
    expect(openVideo.text()).toBe('Video')

    await openVideo.trigger('click')

    expect(wrapper.classes()).toContain('card--video-open')
    expect(wrapper.findComponent({ name: 'VideoEmbed' }).exists()).toBe(true)
    const showThumbnails = wrapper.get('[data-testid="video-view-toggle"]')
    expect(showThumbnails.attributes('aria-label')).toBe('Show thumbnails')
    expect(showThumbnails.text()).toBe('Thumbs')
    expect(wrapper.get('.cardNav').element.children[1]).toBe(
      showThumbnails.element,
    )
    const mute = wrapper.get('[data-testid="video-card-mute"]')
    expect(mute.element.tagName).toBe('BUTTON')
    expect(mute.attributes('aria-label')).toBe('Mute video')
    const existingPlaybackControls = [
      ['video-card-loop', 'Set loop start'],
      ['video-card-skip-back-30', 'Skip back 30 seconds'],
      ['video-card-skip-back-15', 'Skip back 15 seconds'],
      ['video-card-skip-forward-30', 'Skip forward 30 seconds'],
      ['video-card-skip-forward-60', 'Skip forward 60 seconds'],
    ]
    existingPlaybackControls.forEach(([testId, accessibleName]) => {
      const control = wrapper.get(`[data-testid="${testId}"]`)
      expect(control.element.tagName).toBe('BUTTON')
      expect(control.attributes('aria-label')).toBe(accessibleName)
    })

    await showThumbnails.trigger('click')

    expect(wrapper.classes()).not.toContain('card--video-open')
    expect(wrapper.findComponent({ name: 'VideoEmbed' }).exists()).toBe(false)
    expect(wrapper.find('img.thumb').exists()).toBe(true)
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

      await vi.advanceTimersByTimeAsync(700)
      expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
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
