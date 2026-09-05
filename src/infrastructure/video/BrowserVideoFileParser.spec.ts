import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Mock } from 'vitest'
import { buildVideoEntity } from '@test-utils/index'
import { BrowserVideoFileParser } from './BrowserVideoFileParser'
import { captureThumbnail, loadVideoElement } from './services/videoDomUtils'

vi.mock('./services/videoDomUtils', () => ({
  loadVideoElement: vi.fn(),
  captureThumbnail: vi.fn(),
}))

const loadVideoElementMock = loadVideoElement as Mock
const captureThumbnailMock = captureThumbnail as Mock

const stubUrlFunction = <T extends (...args: any[]) => any>(
  key: 'revokeObjectURL' | 'createObjectURL',
  impl: T,
) => {
  const original = (URL as any)[key] as undefined | T
  const spy = vi.fn(impl) as unknown as T

  Object.defineProperty(URL, key, {
    value: spy,
    configurable: true,
    writable: true,
  })

  return {
    spy,
    restore: () => {
      if (typeof original === 'function') {
        Object.defineProperty(URL, key, {
          value: original,
          configurable: true,
          writable: true,
        })
      } else {
        delete (URL as any)[key]
      }
    },
  }
}

describe('BrowserVideoFileParser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => (type === 'video/mp4' ? 'probably' : ''),
    )
  })

  test('returns null for non-video files', async () => {
    const parser = new BrowserVideoFileParser()
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    const result = await parser.transformVideoData(file)

    expect(result).toBeNull()
    expect(loadVideoElementMock).not.toHaveBeenCalled()
  })

  test('extracts metadata and cover thumbnail for valid playable video files', async () => {
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const parser = new BrowserVideoFileParser()

    const generatedVideo = document.createElement('video')
    Object.defineProperty(generatedVideo, 'duration', {
      configurable: true,
      value: 120,
    })

    let clockMs = 10
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => clockMs)
    loadVideoElementMock.mockImplementation(async () => {
      clockMs += 25
      return generatedVideo
    })
    captureThumbnailMock.mockResolvedValue('cover-thumb')
    const onTiming = vi.fn()

    const { spy: createSpy, restore: restoreCreate } = stubUrlFunction(
      'createObjectURL',
      () => 'blob:tmp-v2',
    )
    const { spy: revokeSpy, restore: restoreRevoke } = stubUrlFunction(
      'revokeObjectURL',
      () => undefined,
    )

    try {
      const result = await parser.transformVideoData(file, {
        idHint: 'id-1',
        onTiming,
      })

      expect(onTiming).toHaveBeenCalledWith({
        phase: 'metadata',
        durationMs: 25,
        outcome: 'completed',
      })

      expect(result).toEqual({
        videoEntity: buildVideoEntity({
          id: 'id-1',
          title: 'sample.mp4',
          thumb: 'cover-thumb',
          duration: 120,
          thumbUrls: [],
          tags: [],
        }),
        url: '',
      })

      expect(createSpy).toHaveBeenCalledWith(file)
      expect(loadVideoElementMock).toHaveBeenCalledWith('blob:tmp-v2', {
        label: 'sample.mp4',
        timeoutMs: 8000,
      })
      expect(captureThumbnailMock).toHaveBeenCalledWith(generatedVideo, 12, {
        onTiming,
      })
      expect(revokeSpy).toHaveBeenCalledWith('blob:tmp-v2')
    } finally {
      clock.mockRestore()
      restoreCreate()
      restoreRevoke()
    }
  })

  test('returns null when metadata cannot be loaded from a video file', async () => {
    const file = new File(['video-bytes'], 'broken.mp4', { type: 'video/mp4' })
    const parser = new BrowserVideoFileParser()

    loadVideoElementMock.mockResolvedValue(null)

    const { restore: restoreCreate } = stubUrlFunction(
      'createObjectURL',
      () => 'blob:tmp-broken',
    )
    const { spy: revokeSpy, restore: restoreRevoke } = stubUrlFunction(
      'revokeObjectURL',
      () => undefined,
    )

    try {
      const result = await parser.transformVideoData(file)

      expect(result).toBeNull()
      expect(revokeSpy).toHaveBeenCalledWith('blob:tmp-broken')
    } finally {
      restoreCreate()
      restoreRevoke()
    }
  })

  test('returns null for video MIME types the current browser cannot play', async () => {
    const parser = new BrowserVideoFileParser()
    const file = new File(['video-bytes'], 'sample.mov', {
      type: 'video/quicktime',
    })

    const result = await parser.transformVideoData(file)

    expect(result).toBeNull()
    expect(loadVideoElementMock).not.toHaveBeenCalled()
  })

  test('returns null for files with no MIME type and an unsupported extension', async () => {
    const parser = new BrowserVideoFileParser()
    const file = new File(['video-bytes'], 'sample.avi', { type: '' })

    const result = await parser.transformVideoData(file)

    expect(result).toBeNull()
    expect(loadVideoElementMock).not.toHaveBeenCalled()
  })
})
