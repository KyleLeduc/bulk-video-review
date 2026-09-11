import { afterEach, expect, it, vi } from 'vitest'
import * as utils from '../services/videoDomUtils'
import { extractKeyframesWithDom, extractWithDom } from './domPreviewExtraction'
import { prepareTargets } from '../extraction/previewExtraction'
import { keyframeTargets } from '../../../domain/services/videoPreviewPolicy'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function delayedFrame() {
  const video = document.createElement('video')
  Object.defineProperties(video, {
    duration: { value: 1 },
    videoWidth: { value: 80 },
    videoHeight: { value: 120 },
    readyState: { value: 1, configurable: true },
  })
  video.preload = 'metadata'
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:delayed')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const dispose = vi
    .spyOn(utils, 'disposeVideoElement')
    .mockImplementation(() => {})
  vi.spyOn(utils, 'loadVideoElement').mockResolvedValue(video)
  vi.spyOn(utils, 'seekToTime').mockResolvedValue(undefined)
  const capture = vi.spyOn(utils, 'capturePreviewFrame').mockResolvedValue({
    timestampSeconds: 0,
    width: 80,
    height: 120,
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })
  const controller = new AbortController()
  const remove = vi.spyOn(video, 'removeEventListener')
  const removeAbort = vi.spyOn(controller.signal, 'removeEventListener')
  const pending = extractKeyframesWithDom(
    new File(['x'], 'private.mp4'),
    1,
    controller.signal,
  )
  return {
    video,
    capture,
    controller,
    pending,
    dispose,
    revoke,
    remove,
    removeAbort,
  }
}

it('waits for decoded data at target zero before capturing, without upscaling', async () => {
  const { video, capture, pending, remove, removeAbort } = delayedFrame()
  await Promise.resolve()
  await Promise.resolve()
  expect(capture).not.toHaveBeenCalled()
  expect(video.preload).toBe('auto')
  video.dispatchEvent(new Event('loadeddata'))
  await Promise.resolve()
  expect(capture).not.toHaveBeenCalled()
  Object.defineProperty(video, 'readyState', { value: 2 })
  video.dispatchEvent(new Event('loadeddata'))
  expect(capture).not.toHaveBeenCalled()
  video.dispatchEvent(new Event('seeked'))
  expect(await pending).toMatchObject({ width: 80, height: 120 })
  expect(capture).toHaveBeenCalledOnce()
  expect(video.preload).toBe('metadata')
  expect(remove).toHaveBeenCalledWith('loadeddata', expect.any(Function))
  expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function))
})

it('explicitly seeks target zero even when metadata reports enough data', async () => {
  const { video, capture, pending } = delayedFrame()
  Object.defineProperty(video, 'readyState', { value: 4 })
  const setTime = vi.spyOn(video, 'currentTime', 'set')
  await Promise.resolve()
  await Promise.resolve()
  expect(setTime).toHaveBeenCalledExactlyOnceWith(0)
  expect(capture).not.toHaveBeenCalled()
  video.dispatchEvent(new Event('seeked'))
  await pending
  expect(capture).toHaveBeenCalledExactlyOnceWith(video, 0, expect.any(Object))
})

it.each(['abort', 'timeout', 'error'])(
  'cleans up while waiting for decoded data (%s)',
  async (outcome) => {
    vi.useFakeTimers()
    const {
      video,
      capture,
      controller,
      pending,
      dispose,
      revoke,
      remove,
      removeAbort,
    } = delayedFrame()
    const rejected = expect(pending).rejects.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(capture).not.toHaveBeenCalled()
    if (outcome === 'abort') controller.abort()
    else if (outcome === 'error') video.dispatchEvent(new Event('error'))
    else await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(dispose).toHaveBeenCalledExactlyOnceWith(video)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:delayed')
    expect(remove).toHaveBeenCalledWith('loadeddata', expect.any(Function))
    expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  },
)
it.each([1, 30, 1501, 7200])(
  'captures production DOM seek targets at 160px (%ss)',
  async (duration) => {
    const video = {
      duration,
      videoWidth: 1920,
      videoHeight: 1080,
      readyState: 2,
    } as HTMLVideoElement
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:seek')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const dispose = vi
      .spyOn(utils, 'disposeVideoElement')
      .mockImplementation(() => {})
    vi.spyOn(utils, 'loadVideoElement').mockResolvedValue(video)
    const seek = vi.spyOn(utils, 'seekToTime').mockResolvedValue(undefined)
    const capture = vi
      .spyOn(utils, 'capturePreviewFrame')
      .mockImplementation(async (_video, timestamp) => ({
        timestampSeconds: timestamp,
        width: 160,
        height: 90,
        blob: new Blob(['jpg'], { type: 'image/jpeg' }),
      }))
    const signal = new AbortController().signal
    const output = await extractKeyframesWithDom(
      new File(['x'], 'private.mp4'),
      duration,
      signal,
      160,
    )
    expect(seek.mock.calls.map((call) => call[1])).toEqual(
      keyframeTargets(duration),
    )
    expect(capture).toHaveBeenCalledWith(
      video,
      0,
      expect.objectContaining({ maxWidth: 160, signal }),
    )
    expect(output).toMatchObject({
      width: 160,
      height: 90,
      readBytes: null,
      readCalls: null,
      metrics: { readMs: null, workerOverheadMs: null },
    })
    expect(output.frames).toHaveLength(keyframeTargets(duration).length)
    expect(dispose).toHaveBeenCalledExactlyOnceWith(video)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:seek')
  },
)
it.each(['abort', 'bad-blob', 'oversized-output', 'duration-mismatch'])(
  'cleans up a failed DOM seek extraction (%s)',
  async (failure) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:seek')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const dispose = vi
      .spyOn(utils, 'disposeVideoElement')
      .mockImplementation(() => {})
    vi.spyOn(utils, 'loadVideoElement').mockResolvedValue({
      duration: failure === 'duration-mismatch' ? 2 : 1,
      videoWidth: 80,
      videoHeight: 120,
      readyState: 2,
    } as HTMLVideoElement)
    const controller = new AbortController()
    vi.spyOn(utils, 'seekToTime').mockImplementation(async () => {
      if (failure === 'abort') controller.abort()
    })
    const blob = new Blob(['x'], {
      type: failure === 'bad-blob' ? 'video/mp4' : 'image/jpeg',
    })
    if (failure === 'oversized-output')
      Object.defineProperty(blob, 'size', { value: 16777217 })
    vi.spyOn(utils, 'capturePreviewFrame').mockResolvedValue({
      timestampSeconds: 0,
      width: 80,
      height: 120,
      blob,
    })
    await expect(
      extractKeyframesWithDom(
        new File(['x'], 'private.mp4'),
        1,
        controller.signal,
        160,
      ),
    ).rejects.toThrow()
    expect(dispose).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledOnce()
  },
)
it.each([9, 100] as const)(
  'reports stage evidence after DOM resource cleanup (%s previews)',
  async (count) => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock++)
    const dispose = vi
      .spyOn(utils, 'disposeVideoElement')
      .mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(utils, 'loadVideoElement').mockResolvedValue({
      duration: 10,
      videoWidth: 160,
      videoHeight: 90,
      readyState: 2,
    } as HTMLVideoElement)
    vi.spyOn(utils, 'seekToTime').mockResolvedValue(undefined)
    vi.spyOn(utils, 'capturePreviewFrame').mockImplementation(
      async (_video, time, options) => {
        options?.onTiming?.({
          phase: 'capture',
          durationMs: 1,
          outcome: 'completed',
        })
        options?.onTiming?.({
          phase: 'encode',
          durationMs: 2,
          outcome: 'completed',
        })
        return {
          timestampSeconds: time,
          width: 160,
          height: 90,
          blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        }
      },
    )
    const output = await extractWithDom(
      new File(['x'], 'secret.mp4'),
      prepareTargets(10, 160, 90, count),
      new AbortController().signal,
    )
    expect(output.metrics).toMatchObject({
      encodeMs: count * 2,
      readMs: null,
      workerOverheadMs: null,
    })
    expect(output.metrics.cleanupMs).toBeGreaterThanOrEqual(0)
    expect(output.frames).toHaveLength(count)
    expect(
      vi.mocked(utils.seekToTime).mock.calls.map((call) => call[1]),
    ).toEqual(prepareTargets(10, 160, 90, count).targets)
    expect(dispose).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:test')
  },
)
