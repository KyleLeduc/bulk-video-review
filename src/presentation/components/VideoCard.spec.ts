import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import type { ParsedVideo } from '@domain/entities'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'
import { UPDATE_PREVIEWS_USE_CASE_KEY } from '@presentation/di/injectionKeys'
import {
  motionClipWindows,
  MOTION_PREVIEW_VERSION,
  MOTION_FALLBACK_VERSION,
} from '@domain/services/videoPreviewPolicy'

describe('VideoCard', () => {
  test('shows a validated still fallback without claiming clips ready or showing the orange border', async () => {
    const video = buildParsedVideo({
      duration: 60,
      motionFallback: {
        version: MOTION_FALLBACK_VERSION,
        reason: 'unsupported',
        items: Array.from({ length: 9 }, (_, i) => ({
          timestampSeconds: (i + 1) * 6,
          width: 320,
          height: 180,
          blob: new Blob(['jpg'], { type: 'image/jpeg' }),
        })),
      },
    })
    const context = createPresentationTestContext()
    context.global.provide[UPDATE_PREVIEWS_USE_CASE_KEY as symbol] = {
      execute: vi.fn(),
    }
    const wrapper = mount(VideoCard, {
      props: { video },
      global: context.global,
      shallow: true,
    })
    const store = useVideoStore()
    store.addVideos([video])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Still preview ready')
    expect(wrapper.text()).not.toContain('Clips ready')
    expect(
      wrapper.findComponent({ name: 'MotionPreview' }).props('stills'),
    ).toEqual(video.motionFallback!.items)
    expect(wrapper.find('.thumbnail-activity-ring--active').exists()).toBe(
      false,
    )
    await wrapper.setProps({
      video: {
        ...video,
        motionFallback: {
          ...video.motionFallback!,
          items: video.motionFallback!.items.slice(0, 4),
        },
      },
    })
    expect(
      wrapper.findComponent({ name: 'MotionPreview' }).props('stills'),
    ).toEqual([])
    wrapper.unmount()
  })
  test('opening, closing and unmounting a player update seek priority, including pin-open', async () => {
    const video = buildParsedVideo({ id: 'priority-video' })
    const { global } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: { video },
      global,
      shallow: true,
    })
    const store = useVideoStore()
    const open = vi.spyOn(store, 'setVideoPreviewOpen')
    await wrapper.get('[data-testid="video-view-toggle"]').trigger('click')
    expect(open).toHaveBeenLastCalledWith(video.id, true)
    await wrapper.get('[data-testid="video-view-toggle"]').trigger('click')
    expect(open).toHaveBeenLastCalledWith(video.id, false)
    await wrapper.get('.pin').trigger('click')
    expect(open).toHaveBeenLastCalledWith(video.id, true)
    wrapper.unmount()
    expect(open).toHaveBeenLastCalledWith(video.id, false)
  })

  test('shows clips ready and seeks queued without the orange clip-work border', async () => {
    const video = buildParsedVideo({
      id: 'ready-clips',
      duration: 60,
      previewVersions: { motionClips: MOTION_PREVIEW_VERSION },
      motionClips: motionClipWindows(60).map(({ start, end }) => ({
        timestampSeconds: start,
        durationSeconds: end - start,
        width: 320,
        height: 180,
        blob: new Blob(['clip'], { type: 'video/mp4' }),
      })),
    })
    const context = createPresentationTestContext()
    context.global.provide[UPDATE_PREVIEWS_USE_CASE_KEY as symbol] = {
      execute: vi.fn(),
    }
    const wrapper = mount(VideoCard, {
      props: { video },
      global: context.global,
      shallow: true,
    })
    const store = useVideoStore()
    store.addVideos([video])
    store.setPreviewProcessingPaused(true)
    void store.updateVideoThumbnails(video.id)
    await wrapper.vm.$nextTick()
    expect(
      wrapper.get('[data-testid="video-preview-status"]').text(),
    ).toContain('Clips ready')
    expect(wrapper.text()).toContain('Seek thumbnails paused')
    expect(wrapper.find('.thumbnail-activity-ring--active').exists()).toBe(
      false,
    )
    store.removeVideo(video.id)
    wrapper.unmount()
  })

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
                new Promise<ParsedVideo>(() => {
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
