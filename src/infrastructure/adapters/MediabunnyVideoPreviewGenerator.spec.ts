import { afterEach, expect, it, vi } from 'vitest'
import * as clips from '../video/extraction/clipWorkerClient'
import * as frames from '../video/extraction/previewWorkerClient'
import { emptyMetrics } from '../video/extraction/previewExtraction'
import { MediabunnyVideoPreviewGenerator } from './MediabunnyVideoPreviewGenerator'

afterEach(() => vi.restoreAllMocks())
const file = new File(['mp4'], 'private.mp4')
const signal = new AbortController().signal
const options = { duration: 6, signal }
it('explicitly requests production clips in player time and validates full output', async () => {
  const extract = vi.spyOn(clips, 'extractClipsWithWorker').mockResolvedValue({
    clips: [0, 3].map((start) => ({
      start,
      duration: 1.5,
      blob: new Blob(['mp4'], { type: 'video/mp4' }),
    })),
    width: 320,
    height: 180,
    codec: 'avc',
    readBytes: 4,
    readCalls: 1,
    metrics: {
      setupMs: 1,
      conversionMs: 1,
      firstClipMs: 1,
      totalMs: 2,
      readMs: 1,
      readMaxMs: 1,
    },
  })
  const adapter = new MediabunnyVideoPreviewGenerator()
  const onProgress = vi.fn()
  const output = await adapter.generateMotionClips(file, {
    ...options,
    onProgress,
  })
  expect(extract).toHaveBeenCalledWith(
    file,
    signal,
    20,
    1.5,
    {
      kind: 'motion',
      duration: 6,
    },
    onProgress,
  )
  expect(output.map((clip) => clip.timestampSeconds)).toEqual([0, 3])
  const workerOutput = await extract.mock.results[0].value
  extract.mockResolvedValue({ ...workerOutput, clips: [] })
  await expect(adapter.generateMotionClips(file, options)).rejects.toThrow(
    'output-invalid',
  )
})
it('keeps keyframe timestamps separate from raw source timestamps and clips', async () => {
  const extract = vi
    .spyOn(frames, 'extractKeyframesWithWorker')
    .mockResolvedValue({
      frames: Array.from(
        { length: 4 },
        () => new Blob(['jpeg'], { type: 'image/jpeg' }),
      ),
      width: 160,
      height: 90,
      readBytes: 4,
      readCalls: 1,
      metrics: emptyMetrics(),
    })
  const adapter = new MediabunnyVideoPreviewGenerator()
  const onProgress = vi.fn()
  const result = await adapter.generateKeyframes(file, {
    duration: 60,
    signal,
    onProgress,
  })
  expect(extract).toHaveBeenCalledWith(file, 60, signal, 160, onProgress)
  expect(result.map((frame) => frame.timestampSeconds)).toEqual([0, 15, 30, 45])
  expect(result[0]).toMatchObject({ width: 160, height: 90 })
})
