import { describe, expect, it, vi } from 'vitest'
import { generateThumbnails, seekToTime } from './videoDomUtils'

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
  it('returns [] when a later seek fails after earlier successes', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as CanvasRenderingContext2D)
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,thumb')

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
    toDataUrlSpy.mockRestore()
    vi.useRealTimers()
  })
})
