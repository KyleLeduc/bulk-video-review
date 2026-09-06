import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildParsedVideo,
  buildPreviewProducts,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'
import VideoEmbed from './VideoEmbed.vue'
import MotionPreview from './MotionPreview.vue'

let createUrl: ReturnType<typeof vi.fn<typeof URL.createObjectURL>>
let revokeUrl: ReturnType<typeof vi.fn<typeof URL.revokeObjectURL>>
beforeEach(() => {
  let id = 0
  createUrl = vi.fn(() => 'blob:keyframe-' + ++id)
  revokeUrl = vi.fn()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('VideoCard independent preview products', () => {
  test('lends only granular keyframes to the player and revokes their URLs', async () => {
    const products = buildPreviewProducts()
    const { global } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: {
        video: buildParsedVideo({
          ...products,
          previewFrames: products.keyframes.slice(0, 1),
          thumbUrls: ['legacy'],
        }),
      },
      global,
      shallow: true,
    })
    await wrapper.get('.pin').trigger('click')
    expect(wrapper.getComponent(VideoEmbed).props('previewFrames')).toEqual(
      products.keyframes.map((frame, index) => ({
        timestampSeconds: frame.timestampSeconds,
        width: 160,
        height: 90,
        url: 'blob:keyframe-' + (index + 1),
      })),
    )
    expect(wrapper.findComponent(MotionPreview).exists()).toBe(false)
    wrapper.unmount()
    expect(revokeUrl).toHaveBeenCalledTimes(4)
  })

  test('uses hover for motion while keeping the cover, with no still slideshow fallback', async () => {
    vi.useFakeTimers()
    const { global } = createPresentationTestContext()
    const video = buildParsedVideo({
      ...buildPreviewProducts(),
      thumb: 'cover',
      thumbUrls: ['legacy-1', 'legacy-2'],
    })
    const wrapper = mount(VideoCard, {
      props: { video },
      global,
      shallow: true,
    })
    const image = wrapper.get('img.thumb')
    await image.trigger('mouseenter')
    expect(wrapper.getComponent(MotionPreview).props('active')).toBe(true)
    await vi.advanceTimersByTimeAsync(1100)
    expect(image.attributes('src')).toBe('cover')
    await image.trigger('mouseleave')
    expect(wrapper.getComponent(MotionPreview).props('active')).toBe(false)
    await wrapper.setProps({
      video: buildParsedVideo({ thumb: 'cover', thumbUrls: ['legacy-1'] }),
    })
    await image.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(600)
    expect(image.attributes('src')).toBe('cover')
    await wrapper.get('.pin').trigger('click')
    expect(wrapper.getComponent(VideoEmbed).props('previewFrames')).toEqual([])
    wrapper.unmount()
  })

  test('reuses keyframe URLs on reorder and releases removed frames', async () => {
    const { global } = createPresentationTestContext()
    const frames = buildPreviewProducts().keyframes
    const wrapper = mount(VideoCard, {
      props: { video: buildParsedVideo({ keyframes: frames.slice(0, 2) }) },
      global,
      shallow: true,
    })
    await wrapper.setProps({
      video: buildParsedVideo({ keyframes: [frames[1], frames[0]] }),
    })
    expect(createUrl).toHaveBeenCalledTimes(2)
    expect(revokeUrl).not.toHaveBeenCalled()
    await wrapper.setProps({
      video: buildParsedVideo({ keyframes: frames.slice(1, 3) }),
    })
    expect(createUrl).toHaveBeenCalledTimes(3)
    expect(revokeUrl).toHaveBeenCalledWith('blob:keyframe-1')
    wrapper.unmount()
    expect(revokeUrl).toHaveBeenCalledTimes(3)
  })

  test('cleans partial keyframe URL allocation and leaves seeking available', async () => {
    createUrl
      .mockImplementationOnce(() => 'blob:first')
      .mockImplementationOnce(() => {
        throw new Error('allocation')
      })
    const { global } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: { video: buildParsedVideo(buildPreviewProducts()) },
      global,
      shallow: true,
    })
    expect(revokeUrl).toHaveBeenCalledWith('blob:first')
    await wrapper.get('.pin').trigger('click')
    expect(wrapper.getComponent(VideoEmbed).props('previewFrames')).toEqual([])
    expect(wrapper.text()).toContain('Preview display unavailable')
    wrapper.unmount()
  })
})
