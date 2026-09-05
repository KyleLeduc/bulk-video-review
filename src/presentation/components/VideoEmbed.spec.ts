import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import type { IVideoSessionRegistry } from '@app/ports'
import { VIDEO_SESSION_REGISTRY_KEY } from '@presentation/di/injectionKeys'
import { buildParsedVideo, buildSessionRegistry } from '@test-utils/index'
import VideoEmbed from './VideoEmbed.vue'

describe('VideoEmbed', () => {
  afterEach(() => vi.restoreAllMocks())

  test('does not start delayed autoplay after unmount', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    const sessionRegistry = buildSessionRegistry({
      acquireObjectUrl: () => 'blob:playback',
    })
    const wrapper = mount(VideoEmbed, {
      props: { video: buildParsedVideo({ id: 'id-1' }) },
      global: {
        provide: { [VIDEO_SESSION_REGISTRY_KEY as symbol]: sessionRegistry },
      },
    })

    wrapper.unmount()
    await nextTick()

    expect(play).not.toHaveBeenCalled()
    expect(sessionRegistry.releaseObjectUrl).toHaveBeenCalledOnce()
  })

  test.each(['AbortError', 'NotAllowedError'])(
    'settles a rejected play request (%s) without an unhandled rejection',
    async (name) => {
      const error = new DOMException('Playback did not start', name)
      const play = vi
        .spyOn(HTMLMediaElement.prototype, 'play')
        .mockRejectedValueOnce(error)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const wrapper = mount(VideoEmbed, {
        props: {
          video: buildParsedVideo({ url: 'blob:playback' }),
          options: { playing: false, muted: true, volume: 0.5 },
        },
        global: {
          provide: {
            [VIDEO_SESSION_REGISTRY_KEY as symbol]: buildSessionRegistry(),
          },
        },
      })

      try {
        wrapper.get('video').element.pause()
        await wrapper.get('video').trigger('click')
        await flushPromises()
        expect(play).toHaveBeenCalledOnce()
        expect(wrapper.get('video').attributes('aria-label')).toBe('Play video')
        if (name === 'AbortError') {
          expect(warn).not.toHaveBeenCalled()
        } else {
          expect(warn).toHaveBeenCalledWith(
            '[VideoEmbed] Failed to start playback',
            error,
          )
        }
      } finally {
        wrapper.unmount()
      }
    },
  )

  test('finishes binding the registry source before requesting autoplay', async () => {
    const source = vi.spyOn(HTMLMediaElement.prototype, 'src', 'set')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    const wrapper = mount(VideoEmbed, {
      props: { video: buildParsedVideo({ id: 'id-1' }) },
      global: {
        provide: {
          [VIDEO_SESSION_REGISTRY_KEY as symbol]: buildSessionRegistry({
            acquireObjectUrl: () => 'blob:playback',
          }),
        },
      },
    })

    await nextTick()

    try {
      expect(wrapper.get('video').attributes('src')).toBe('blob:playback')
      expect(source).toHaveBeenCalledWith('blob:playback')
      expect(play).toHaveBeenCalledOnce()
      // Reassigning src after play() aborts pending playback in a real browser.
      expect(play.mock.invocationCallOrder[0]).toBeGreaterThan(
        Math.max(...source.mock.invocationCallOrder),
      )
    } finally {
      wrapper.unmount()
    }
  })

  test('acquires a blob URL on mount and releases it on unmount', async () => {
    const sessionRegistry: IVideoSessionRegistry = buildSessionRegistry({
      acquireObjectUrl: vi.fn(() => 'blob:playback'),
    })

    const wrapper = mount(VideoEmbed, {
      props: {
        video: buildParsedVideo({ id: 'id-1' }),
        options: {
          playing: false,
          muted: true,
          volume: 0.5,
        },
      },
      global: {
        provide: {
          [VIDEO_SESSION_REGISTRY_KEY as symbol]: sessionRegistry,
        },
      },
    })

    await nextTick()

    expect(sessionRegistry.acquireObjectUrl).toHaveBeenCalledWith('id-1')
    expect(wrapper.get('video').attributes('src')).toBe('blob:playback')

    wrapper.unmount()
    expect(sessionRegistry.releaseObjectUrl).toHaveBeenCalledWith('id-1')
  })
})
