import { flushPromises, mount } from '@vue/test-utils'
import { toRaw } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildPreviewProducts } from '@test-utils/index'
import MotionPreview from './MotionPreview.vue'

let intersect: (entries: { isIntersecting: boolean }[]) => void
let reduced: (event: { matches: boolean }) => void
let createUrl: ReturnType<typeof vi.fn<typeof URL.createObjectURL>>
let revokeUrl: ReturnType<typeof vi.fn<typeof URL.revokeObjectURL>>
const clips = () => buildPreviewProducts().motionClips.slice(0, 2)
async function start(items = clips()) {
  const wrapper = mount(MotionPreview, {
    props: { clips: items, active: true },
  })
  intersect([{ isIntersecting: true }])
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  let id = 0
  createUrl = vi.fn(() => `blob:motion-${++id}`)
  revokeUrl = vi.fn()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => createUrl(blob))
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revokeUrl(url))
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersect) {
        intersect = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: (_name: string, callback: typeof reduced) => {
      reduced = callback
    },
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('inert motion preview lifecycle', () => {
  test('cycles nine fallback stills, wraps, and gives real clips precedence', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stills = Array.from({ length: 9 }, (_, i) => ({
      timestampSeconds: i,
      width: 320,
      height: 180,
      blob: new Blob([String(i)], { type: 'image/jpeg' }),
    }))
    const wrapper = mount(MotionPreview, {
      props: { clips: [], stills, active: true },
    })
    intersect([{ isIntersecting: true }])
    await flushPromises()
    expect(wrapper.find('video').exists()).toBe(false)
    for (let i = 0; i < 9; i++) {
      expect(toRaw(createUrl.mock.calls[i][0])).toBe(stills[i].blob)
      await wrapper.get('img').trigger('load')
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(toRaw(createUrl.mock.calls[9][0])).toBe(stills[0].blob)
    await wrapper.setProps({ clips: clips() })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('video').exists()).toBe(true)
    wrapper.unmount()
    expect(revokeUrl.mock.calls.length).toBe(createUrl.mock.calls.length)
    expect(vi.getTimerCount()).toBe(0)
  })

  test.each([
    'blur',
    'hidden',
    'offscreen',
    'reduced',
    'leave',
    'error',
  ] as const)(
    'stops still timers and ignores stale image loads after %s',
    async (reason) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const stills = [buildPreviewProducts().keyframes[0]]
      const wrapper = mount(MotionPreview, {
        props: { clips: [], stills, active: true },
      })
      intersect([{ isIntersecting: true }])
      await flushPromises()
      const old = wrapper.get('img')
      await old.trigger('load')
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (reason === 'offscreen') intersect([{ isIntersecting: false }])
      if (reason === 'reduced') reduced({ matches: true })
      if (reason === 'leave') await wrapper.setProps({ active: false })
      if (reason === 'error') await old.trigger('error')
      await flushPromises()
      old.element.dispatchEvent(new Event('load'))
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.find('img').exists()).toBe(false)
      expect(createUrl).toHaveBeenCalledOnce()
      expect(revokeUrl).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      wrapper.unmount()
    },
  )
  test('loads only in view, cycles clips and releases each source', async () => {
    const wrapper = mount(MotionPreview, {
      props: { clips: clips(), active: true },
    })
    expect(wrapper.find('video').exists()).toBe(false)
    intersect([{ isIntersecting: true }])
    await flushPromises()
    const video = wrapper.get('video')
    expect(video.element.controls).toBe(false)
    expect(video.element.muted).toBe(true)
    expect(video.attributes()).toMatchObject({
      tabindex: '-1',
      'aria-hidden': 'true',
      playsinline: '',
    })
    await video.trigger('ended')
    await flushPromises()
    expect(wrapper.get('video').attributes('src')).toBe('blob:motion-2')
    expect(revokeUrl).toHaveBeenCalledWith('blob:motion-1')
    await wrapper.get('video').trigger('ended')
    await flushPromises()
    expect(createUrl.mock.calls[2][0]).toBe(createUrl.mock.calls[0][0])
    wrapper.unmount()
    expect(revokeUrl).toHaveBeenCalledTimes(3)
  })

  test.each(['blur', 'hidden', 'offscreen', 'reduced', 'leave'] as const)(
    'stops and releases on %s',
    async (reason) => {
      const wrapper = await start()
      const old = wrapper.get('video').element
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (reason === 'offscreen') intersect([{ isIntersecting: false }])
      if (reason === 'reduced') reduced({ matches: true })
      if (reason === 'leave') await wrapper.setProps({ active: false })
      await flushPromises()
      expect(wrapper.find('video').exists()).toBe(false)
      expect(old.getAttribute('src')).toBeNull()
      expect(revokeUrl).toHaveBeenCalledOnce()
      old.dispatchEvent(new Event('ended'))
      await flushPromises()
      expect(createUrl).toHaveBeenCalledOnce()
      wrapper.unmount()
    },
  )

  test('single clip wraps, but rejected playback returns to the cover', async () => {
    const wrapper = await start(clips().slice(0, 1))
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error('blocked'),
    )
    await wrapper.get('video').trigger('ended')
    await flushPromises()
    expect(createUrl).toHaveBeenCalledTimes(2)
    expect(wrapper.find('video').exists()).toBe(false)
    expect(wrapper.emitted('error')).toHaveLength(1)
    wrapper.unmount()
  })

  test('a stale play rejection after source replacement cannot retire the new player', async () => {
    let reject: (reason: Error) => void = () => {}
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    const wrapper = await start()
    const old = wrapper.get('video').element
    await wrapper.setProps({ clips: clips() })
    await flushPromises()
    reject(new Error('old source'))
    old.dispatchEvent(new Event('ended'))
    await flushPromises()
    expect(wrapper.get('video').attributes('src')).toBe('blob:motion-2')
    expect(wrapper.emitted('error')).toBeUndefined()
    wrapper.unmount()
  })

  test('URL allocation failure leaves no player or leaked source', async () => {
    createUrl.mockImplementationOnce(() => {
      throw new Error('allocation failed')
    })
    const wrapper = await start()
    expect(wrapper.find('video').exists()).toBe(false)
    expect(wrapper.emitted('error')).toHaveLength(1)
    wrapper.unmount()
  })
})
