import { afterEach, describe, expect, test, vi } from 'vitest'
import { runKeyframeBenchmark } from './runKeyframeBenchmark'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as worker from '../infrastructure/video/extraction/previewWorkerClient'
import {
  emptyMetrics,
  ExtractionError,
} from '../infrastructure/video/extraction/previewExtraction'
import { keyframeTargets } from '../domain/services/videoPreviewPolicy'

const options = () => ({
  files: [new File(['private'], 'secret.mp4')],
  selectionId: 'selection',
  build: { revision: null, dirty: null, assetsSha256: null },
  signal: new AbortController().signal,
  maxWidth: 160 as const,
  sampleFile: 1,
})
afterEach(() => vi.restoreAllMocks())
describe('production keyframe quality benchmark', () => {
  test.each([1, 30, 1501, 7200])(
    'reports exact expected and actual counts for %ss without exporting media or targets',
    async (duration) => {
      vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(duration)
      const frames = keyframeTargets(duration).map(
        () => new Blob(['private'], { type: 'image/jpeg' }),
      )
      const extract = vi
        .spyOn(worker, 'extractKeyframesWithWorker')
        .mockResolvedValue({
          frames,
          width: 160,
          height: 90,
          readBytes: 1024,
          readCalls: 1,
          metrics: emptyMetrics(),
        })
      const sample = vi.fn()
      const report = await runKeyframeBenchmark({
        ...options(),
        onSample: sample,
      })
      expect(extract).toHaveBeenCalledWith(
        expect.any(File),
        duration,
        expect.any(AbortSignal),
        160,
      )
      expect(report.rows[0]).toMatchObject({
        expectedFrames: frames.length,
        frames: frames.length,
        status: 'passed',
        width: 160,
      })
      expect(report.settings).toMatchObject({
        samplingPolicy: '15s-max100',
        maxWidth: 160,
        quality: 0.72,
      })
      expect(sample.mock.calls[0][0]).toMatchObject({
        file: 1,
        duration,
        output: { frames },
      })
      expect(JSON.stringify(report)).not.toMatch(
        /private|secret|blob:|timestampSeconds|"targets"|"blob"/,
      )
    },
  )
  test('does not substitute another file when the fixed comparison source fails', async () => {
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(1)
    vi.spyOn(worker, 'extractKeyframesWithWorker')
      .mockRejectedValueOnce(new ExtractionError('unsupported-timeline'))
      .mockResolvedValue({
        frames: [new Blob(['jpg'], { type: 'image/jpeg' })],
        width: 160,
        height: 90,
        readBytes: 1024,
        readCalls: 1,
        metrics: emptyMetrics(),
      })
    const sample = vi.fn()
    const report = await runKeyframeBenchmark({
      ...options(),
      files: [...options().files, new File(['second'], 'other.mp4')],
      onSample: sample,
    })
    expect(report.status).toBe('failed')
    expect(report.rows[1].status).toBe('passed')
    expect(sample).not.toHaveBeenCalled()
  })
  test('interruption retains partial rows and publishes no samples', async () => {
    const controller = new AbortController()
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(1)
    vi.spyOn(worker, 'extractKeyframesWithWorker').mockImplementation(
      async () => {
        controller.abort()
        throw new DOMException('private', 'AbortError')
      },
    )
    const sample = vi.fn()
    const report = await runKeyframeBenchmark({
      ...options(),
      signal: controller.signal,
      onSample: sample,
    })
    expect(report.status).toBe('interrupted')
    expect(report.rows[0].status).toBe('aborted')
    expect(sample).not.toHaveBeenCalled()
  })
})
