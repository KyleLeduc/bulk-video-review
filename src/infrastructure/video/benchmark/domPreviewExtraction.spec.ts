import { afterEach, expect, it, vi } from 'vitest'
import * as utils from '../services/videoDomUtils'
import { extractWithDom } from './domPreviewExtraction'
import { prepareTargets } from './previewExtraction'

afterEach(() => vi.restoreAllMocks())
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
