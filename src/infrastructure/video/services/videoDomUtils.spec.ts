import { describe, expect, it, vi } from 'vitest'
import {
  capturePreviewFrame,
  captureThumbnail,
  generateThumbnails,
  seekToTime,
} from './videoDomUtils'

type SeekHandler = (time: number, signalSeeked: () => void) => void

const buildVideoElement = (options: {
  duration: number
  onSeek: SeekHandler
}) => {
  const video = document.createElement('video')
  let currentTime = 0
  let seeking = false

  Object.defineProperty(video, 'duration', {
    value: options.duration,
    configurable: true,
  })
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value
      seeking = true
      options.onSeek(value, () => {
        seeking = false
        video.dispatchEvent(new Event('seeked'))
      })
    },
    configurable: true,
  })
  Object.defineProperty(video, 'seeking', {
    get: () => seeking,
    configurable: true,
  })

  return video
}

describe('seekToTime', () => {
  it('retries when the first seek attempt times out', async () => {
    vi.useFakeTimers()

    let attempts = 0
    const video = buildVideoElement({
      duration: 2000,
      onSeek: (_time, signalSeeked) => {
        attempts += 1
        if (attempts === 2) {
          setTimeout(signalSeeked, 500)
        }
      },
    })

    const seekPromise = seekToTime(video, 116)
    let resolved = false
    seekPromise.then(
      () => {
        resolved = true
      },
      () => {},
    )

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(500)

    expect(resolved).toBe(true)
    vi.useRealTimers()
  })
})

describe('generateThumbnails', () => {
  it('measures seek, synchronous capture and asynchronous encode separately', async () => {
    let clockMs = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => clockMs)
    const video = buildVideoElement({
      duration: 12,
      onSeek: (_time, signalSeeked) => {
        clockMs += 7
        signalSeeked()
      },
    })
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: () => {
          clockMs += 3
        },
      } as unknown as CanvasRenderingContext2D)
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => {
        clockMs += 11
        callback(new Blob(['thumb']))
      })
    const onTiming = vi.fn()
    try {
      expect(
        await generateThumbnails(video, { count: 2, onTiming }),
      ).toHaveLength(1)
      expect(onTiming.mock.calls).toEqual([
        [{ phase: 'seek', durationMs: 7, outcome: 'completed' }],
        [{ phase: 'capture', durationMs: 3, outcome: 'completed' }],
        [{ phase: 'encode', durationMs: 11, outcome: 'completed' }],
      ])
      onTiming.mockClear()
      await captureThumbnail(video, 2, { onTiming })
      expect(onTiming.mock.calls.map(([sample]) => sample.phase)).toEqual([
        'seek',
        'capture',
        'encode',
        'serialize',
      ])
      expect(onTiming.mock.calls[3][0]).toMatchObject({
        outcome: 'completed',
        durationMs: 0,
      })
    } finally {
      clock.mockRestore()
      context.mockRestore()
      encode.mockRestore()
    }
  })

  it('returns [] when a later seek fails after earlier successes', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D)
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) =>
        callback(new Blob(['thumb'], { type: 'image/jpeg' })),
      )

    const video = buildVideoElement({
      duration: 120,
      onSeek: (time, signalSeeked) => {
        const rounded = Math.round(time)
        if (rounded === 30 || rounded === 60) {
          setTimeout(signalSeeked, 10)
        }
      },
    })

    const thumbnailsPromise = generateThumbnails(video, 4)
    await vi.runAllTimersAsync()

    await expect(thumbnailsPromise).resolves.toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[videoDomUtils] generateThumbnails failed',
      expect.objectContaining({ time: 90 }),
    )

    warnSpy.mockRestore()
    getContextSpy.mockRestore()
    toBlobSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('bounded preview capture', () => {
  it('encodes a source-resolution frame as an async bounded Blob', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 3840 },
      videoHeight: { configurable: true, value: 2160 },
    })

    let capturedWidth = 0
    let capturedHeight = 0
    const drawImage = vi.fn()
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (this: HTMLCanvasElement) {
        capturedWidth = this.width
        capturedHeight = this.height
        return { drawImage } as unknown as CanvasRenderingContext2D
      })
    const toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    const previewBlob = new Blob(['preview'], { type: 'image/jpeg' })
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) =>
        queueMicrotask(() => callback(previewBlob)),
      )

    const frame = await capturePreviewFrame(video, 42)

    expect(capturedWidth).toBe(480)
    expect(capturedHeight).toBe(270)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 480, 270)
    expect(toBlobSpy).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.72,
    )
    expect(toDataUrlSpy).not.toHaveBeenCalled()
    expect(frame).toEqual({
      timestampSeconds: 42,
      blob: previewBlob,
      width: 480,
      height: 270,
    })

    getContextSpy.mockRestore()
    toDataUrlSpy.mockRestore()
    toBlobSpy.mockRestore()
  })

  it('uses the same bounded async encode for the persisted cover', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      duration: { configurable: true, value: 120 },
      currentTime: { configurable: true, value: 12, writable: true },
      seeking: { configurable: true, value: false },
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
    })
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D)
    const toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) =>
        callback(new Blob(['cover'], { type: 'image/jpeg' })),
      )

    const cover = await captureThumbnail(video, 12)

    expect(cover).toMatch(/^data:image\/jpeg;base64,/)
    expect(toBlobSpy).toHaveBeenCalled()
    expect(toDataUrlSpy).not.toHaveBeenCalled()

    getContextSpy.mockRestore()
    toDataUrlSpy.mockRestore()
    toBlobSpy.mockRestore()
  })

  it('rejects capture with AbortError before allocating a canvas', async () => {
    const controller = new AbortController()
    controller.abort()
    const createElementSpy = vi.spyOn(document, 'createElement')

    await expect(
      capturePreviewFrame(document.createElement('video'), 10, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(createElementSpy).toHaveBeenCalledTimes(1)
    createElementSpy.mockRestore()
  })

  it('rejects capture when aborted while canvas encoding is still pending', async () => {
    const controller = new AbortController()
    const video = document.createElement('video')
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D)
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(() => {})

    const capturePromise = capturePreviewFrame(video, 10, {
      signal: controller.signal,
    })
    const abortExpectation = expect(capturePromise).rejects.toMatchObject({
      name: 'AbortError',
    })

    controller.abort()
    await abortExpectation

    getContextSpy.mockRestore()
    toBlobSpy.mockRestore()
  })

  it('times out when canvas encoding never completes', async () => {
    vi.useFakeTimers()
    const video = document.createElement('video')
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D)
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(() => {})

    const capturePromise = capturePreviewFrame(video, 10)
    const timeoutExpectation =
      expect(capturePromise).rejects.toThrow(/encoding timed out/i)

    await vi.runAllTimersAsync()
    await timeoutExpectation

    getContextSpy.mockRestore()
    toBlobSpy.mockRestore()
    vi.useRealTimers()
  })
})

describe('abortable seeking', () => {
  it('preserves AbortError instead of retrying an intentionally cancelled seek', async () => {
    const controller = new AbortController()
    controller.abort()
    const video = buildVideoElement({ duration: 120, onSeek: () => {} })

    await expect(
      seekToTime(video, 30, {
        signal: controller.signal,
        timeoutsMs: [1],
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
