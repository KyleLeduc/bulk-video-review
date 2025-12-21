import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import type { IVideoSessionRegistry } from '@app/ports'
import { VIDEO_SESSION_REGISTRY_KEY } from '@presentation/di/injectionKeys'
import VideoEmbed from './VideoEmbed.vue'

describe('VideoEmbed', () => {
  test('acquires a blob URL on mount and releases it on unmount', async () => {
    const sessionRegistry: IVideoSessionRegistry = {
      registerFile: vi.fn(),
      unregisterFile: vi.fn(),
      acquireObjectUrl: vi.fn(() => 'blob:playback'),
      releaseObjectUrl: vi.fn(),
    }

    const wrapper = mount(VideoEmbed, {
      props: {
        video: {
          id: 'id-1',
          title: 'sample.mp4',
          thumb: '',
          duration: 0,
          thumbUrls: [],
          tags: [],
          votes: 0,
          url: '',
          pinned: false,
        },
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
