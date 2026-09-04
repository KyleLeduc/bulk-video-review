import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { IVideoSessionRegistry } from '@app/ports'
import { VIDEO_SESSION_REGISTRY_KEY } from '@presentation/di/injectionKeys'
import { buildParsedVideo, buildSessionRegistry } from '@test-utils/index'
import VideoEmbed from './VideoEmbed.vue'

const previewFrames = [
  {
    timestampSeconds: 0,
    url: 'blob:preview-start',
    width: 480,
    height: 270,
  },
  {
    timestampSeconds: 50,
    url: 'blob:preview-middle',
    width: 480,
    height: 270,
  },
  {
    timestampSeconds: 100,
    url: 'blob:preview-end',
    width: 480,
    height: 270,
  },
]

const mountPlayer = (
  frames = previewFrames,
  duration = 100,
  sessionRegistry: IVideoSessionRegistry = buildSessionRegistry(),
) =>
  mount(VideoEmbed, {
    props: {
      video: buildParsedVideo({
        id: 'video-1',
        duration,
        url: 'blob:playback-source',
      }),
      options: {
        playing: false,
        muted: true,
        volume: 0.5,
      },
      previewFrames: frames,
    },
    global: {
      provide: {
        [VIDEO_SESSION_REGISTRY_KEY as symbol]: sessionRegistry,
      },
    },
  })

describe('VideoEmbed preview rail', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    createObjectURL = vi.fn()
    revokeObjectURL = vi.fn()
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
  })

  afterEach(() => {
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      })
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL')
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      })
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
    vi.restoreAllMocks()
  })

  test.each([
    [5, 'blob:preview-start'],
    [52, 'blob:preview-middle'],
    [95, 'blob:preview-end'],
  ])(
    'selects the nearest frame at pointer position %s without seeking',
    async (clientX, expectedUrl) => {
      const wrapper = mountPlayer()
      const video = wrapper.get('video').element as HTMLVideoElement
      video.currentTime = 12
      const rail = wrapper.get('[data-testid="video-preview-rail"]')
      vi.spyOn(rail.element, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 100,
        top: 0,
        right: 100,
        bottom: 10,
        height: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      await rail.trigger('pointermove', { clientX })

      expect(
        wrapper.get('[data-testid="video-preview-image"]').attributes('src'),
      ).toBe(expectedUrl)
      expect(video.currentTime).toBe(12)
      wrapper.unmount()
    },
  )

  test('seeks intentionally through the accessible range input', async () => {
    const wrapper = mountPlayer()
    const video = wrapper.get('video').element as HTMLVideoElement
    const rail = wrapper.get<HTMLInputElement>(
      '[data-testid="video-preview-rail"]',
    )

    await rail.setValue('90')

    expect(video.currentTime).toBe(90)
    expect(
      wrapper.get('[data-testid="video-preview-image"]').attributes('src'),
    ).toBe('blob:preview-end')
    expect(wrapper.get('[data-testid="video-preview-time"]').text()).toBe(
      '1:30',
    )
    expect(rail.attributes('aria-label')).toBe(
      'Video preview and seek timeline',
    )
    wrapper.unmount()
  })

  test('hides the preview tooltip on pointer leave and blur', async () => {
    const wrapper = mountPlayer()
    const rail = wrapper.get('[data-testid="video-preview-rail"]')
    vi.spyOn(rail.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      right: 100,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    await rail.trigger('pointermove', { clientX: 50 })
    expect(wrapper.find('[data-testid="video-preview-tooltip"]').exists()).toBe(
      true,
    )

    await rail.trigger('pointerleave')
    expect(wrapper.find('[data-testid="video-preview-tooltip"]').exists()).toBe(
      false,
    )

    await rail.trigger('focus')
    expect(wrapper.find('[data-testid="video-preview-tooltip"]').exists()).toBe(
      true,
    )
    await rail.trigger('blur')
    expect(wrapper.find('[data-testid="video-preview-tooltip"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })

  test('keeps the tooltip inside the rail at both timeline edges', async () => {
    const wrapper = mountPlayer()
    const rail = wrapper.get('[data-testid="video-preview-rail"]')
    vi.spyOn(rail.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      right: 100,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    await rail.trigger('pointermove', { clientX: 0 })
    const startStyle = wrapper
      .get('[data-testid="video-preview-tooltip"]')
      .attributes('style')
    expect(startStyle).toContain('left: 0%')
    expect(startStyle).toContain('translateX(0)')

    await rail.trigger('pointermove', { clientX: 100 })
    const endStyle = wrapper
      .get('[data-testid="video-preview-tooltip"]')
      .attributes('style')
    expect(endStyle).toContain('left: 100%')
    expect(endStyle).toContain('translateX(-100%)')

    wrapper.unmount()
  })

  test('keeps seeking available before preview frames are ready', async () => {
    const noFrames = mountPlayer([], 100)
    const rail = noFrames.get<HTMLInputElement>(
      '[data-testid="video-preview-rail"]',
    )

    await rail.setValue('25')

    expect(
      (noFrames.get('video').element as HTMLVideoElement).currentTime,
    ).toBe(25)
    expect(
      noFrames.find('[data-testid="video-preview-tooltip"]').exists(),
    ).toBe(false)
    noFrames.unmount()

    const noDuration = mountPlayer(previewFrames, 0)
    expect(noDuration.find('[data-testid="video-preview-rail"]').exists()).toBe(
      false,
    )
    expect(noDuration.get('video').attributes('aria-label')).toBe('Play video')
    noDuration.unmount()
  })

  test('uses a bottom custom control row without native controls', () => {
    const sessionRegistry = buildSessionRegistry()
    const wrapper = mountPlayer(previewFrames, 100, sessionRegistry)
    const shellChildren = wrapper.get('.video-player-shell').element.children

    expect(wrapper.get('video').attributes()).not.toHaveProperty('controls')
    expect(shellChildren[0]?.tagName).toBe('VIDEO')
    expect(shellChildren[1]?.classList).toContain(
      'video-preview-rail-container',
    )
    expect(wrapper.find('[data-testid="video-playback-toggle"]').exists()).toBe(
      false,
    )
    expect(wrapper.get('video').attributes('role')).toBe('button')
    expect(wrapper.get('video').attributes('tabindex')).toBe('0')
    expect(wrapper.get('video').attributes('aria-label')).toBe('Play video')
    expect(createObjectURL).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(sessionRegistry.releaseObjectUrl).not.toHaveBeenCalled()
  })

  test('toggles playback from the video surface with reactive labels', async () => {
    const wrapper = mountPlayer()
    const video = wrapper.get('video')
    let isPaused = true
    Object.defineProperty(video.element, 'paused', {
      configurable: true,
      get: () => isPaused,
    })

    await video.trigger('click')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    await video.trigger('play')
    expect(video.attributes('aria-label')).toBe('Pause video')

    isPaused = false
    await video.trigger('click')
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)

    await video.trigger('pause')
    expect(video.attributes('aria-label')).toBe('Play video')

    await video.trigger('ended')
    expect(video.attributes('aria-label')).toBe('Play video')
    wrapper.unmount()
  })

  test('uses media paused state before delayed playback events arrive', async () => {
    const wrapper = mountPlayer()
    const video = wrapper.get('video')
    let isPaused = true
    Object.defineProperty(video.element, 'paused', {
      configurable: true,
      get: () => isPaused,
    })
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => {
      isPaused = false
      return Promise.resolve()
    })

    await video.trigger('click')
    await video.trigger('click')

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
