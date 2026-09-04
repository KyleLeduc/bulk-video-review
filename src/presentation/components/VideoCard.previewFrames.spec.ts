import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { VideoPreviewFrame } from '@domain/entities'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoCard from './VideoCard.vue'
import VideoEmbed from './VideoEmbed.vue'

const frame = (
  timestampSeconds: number,
  content: string,
): VideoPreviewFrame => ({
  timestampSeconds,
  blob: new Blob([content], { type: 'image/jpeg' }),
  width: 480,
  height: 270,
})

describe('VideoCard Blob preview frames', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined

  beforeEach(() => {
    createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:preview-1')
      .mockReturnValueOnce('blob:preview-2')
      .mockReturnValueOnce('blob:preview-3')
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
    vi.useRealTimers()
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

  test('creates one object URL per Blob and lends display frames to VideoEmbed', async () => {
    const previewFrames = [frame(3, 'first'), frame(7, 'second')]
    const { global } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: {
        video: buildParsedVideo({ id: 'video-1', previewFrames }),
      },
      global,
    })

    expect(createObjectURL).toHaveBeenNthCalledWith(1, previewFrames[0].blob)
    expect(createObjectURL).toHaveBeenNthCalledWith(2, previewFrames[1].blob)

    await wrapper.get('.pin').trigger('click')
    expect(wrapper.getComponent(VideoEmbed).props('previewFrames')).toEqual([
      {
        timestampSeconds: 3,
        url: 'blob:preview-1',
        width: 480,
        height: 270,
      },
      {
        timestampSeconds: 7,
        url: 'blob:preview-2',
        width: 480,
        height: 270,
      },
    ])

    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
  })

  test('rotates resolved frames on hover and returns to the cover on leave', async () => {
    vi.useFakeTimers()
    const previewFrames = [frame(3, 'first'), frame(7, 'second')]
    const video = buildParsedVideo({
      id: 'video-1',
      thumb: 'data:image/jpeg;base64,cover',
      previewFrames,
    })
    const { global, mocks } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: { video },
      global,
      shallow: true,
    })
    const image = wrapper.get('img.thumb')

    expect(image.attributes('src')).toBe(video.thumb)
    await image.trigger('mouseenter')
    expect(image.attributes('src')).toBe('blob:preview-1')

    await vi.advanceTimersByTimeAsync(500)
    expect(image.attributes('src')).toBe('blob:preview-2')

    await vi.advanceTimersByTimeAsync(500)
    expect(image.attributes('src')).toBe('blob:preview-1')
    expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

    await image.trigger('mouseleave')
    expect(image.attributes('src')).toBe(video.thumb)
    wrapper.unmount()
  })

  test('reuses URLs for reordered Blobs and revokes only removed frames', async () => {
    const first = frame(3, 'first')
    const second = frame(7, 'second')
    const third = frame(11, 'third')
    const { global } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: {
        video: buildParsedVideo({
          id: 'video-1',
          previewFrames: [first, second],
        }),
      },
      global,
      shallow: true,
    })

    await wrapper.setProps({
      video: buildParsedVideo({
        id: 'video-1',
        previewFrames: [second, first],
      }),
    })
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    await wrapper.setProps({
      video: buildParsedVideo({
        id: 'video-1',
        previewFrames: [second, third],
      }),
    })

    expect(createObjectURL).toHaveBeenCalledTimes(3)
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')

    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(3)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-3')
  })

  test('keeps legacy preview URLs usable without creating object URLs', async () => {
    vi.useFakeTimers()
    const video = buildParsedVideo({
      id: 'video-1',
      duration: 90,
      thumb: 'data:image/jpeg;base64,cover',
      thumbUrls: [
        'data:image/jpeg;base64,legacy-1',
        'data:image/jpeg;base64,legacy-2',
      ],
      previewFrames: [],
    })
    const { global, mocks } = createPresentationTestContext()
    const wrapper = mount(VideoCard, {
      props: { video },
      global,
      shallow: true,
    })
    const image = wrapper.get('img.thumb')

    await image.trigger('mouseenter')
    expect(image.attributes('src')).toBe(video.thumbUrls[0])

    await vi.advanceTimersByTimeAsync(500)
    expect(image.attributes('src')).toBe(video.thumbUrls[1])
    await vi.advanceTimersByTimeAsync(300)

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(mocks.useCases.updateThumbUseCase.execute).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
