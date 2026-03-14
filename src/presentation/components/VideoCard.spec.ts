import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'

describe('VideoCard', () => {
  test('wraps media inside a fixed 16:9 landscape frame', () => {
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

    const source = readFileSync(
      `${process.cwd()}/src/presentation/components/VideoCard.vue`,
      'utf8',
    )

    expect(source).toContain('aspect-ratio: 16 / 9;')
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

  test('uses border-box sizing for the full-width card surface so tiles stay inside grid tracks', () => {
    const source = readFileSync(
      `${process.cwd()}/src/presentation/components/VideoCard.vue`,
      'utf8',
    )

    expect(source).toContain('.cardSurface')
    expect(source).toContain('width: 100%;')
    expect(source).toContain('box-sizing: border-box;')
  })
})
