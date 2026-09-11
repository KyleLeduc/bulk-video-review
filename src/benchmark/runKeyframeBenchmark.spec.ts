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
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe('production keyframe quality benchmark', () => {
  test('retains allowlisted failure diagnostics but never raw errors or names', async () => {
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(60)
    vi.spyOn(worker, 'extractKeyframesWithWorker').mockRejectedValue(
      new ExtractionError('unsupported-timeline', {
        stage: 'timeline',
        trackEnd: 59.97,
        storedDuration: 60,
        timeResolution: 1000,
        timelineReason: 'track-ends-before-player',
        ...{ filename: 'private.mp4', message: 'private message' },
      }),
    )
    const result = await runKeyframeBenchmark(options())
    expect(result.rows[0]).toMatchObject({
      status: 'failed',
      diagnostics: {
        stage: 'timeline',
        timeResolution: 1000,
        timelineReason: 'track-ends-before-player',
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/private|filename|message|stack/)
  })
  test('compares the DOM backend without claiming measured reads', async () => {
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(1)
    vi.spyOn(dom, 'extractKeyframesWithDom').mockResolvedValue({
      frames: [new Blob(['jpg'], { type: 'image/jpeg' })],
      width: 160,
      height: 90,
      readBytes: null,
      readCalls: null,
      metrics: emptyMetrics(),
    })
    const bunny = vi.spyOn(worker, 'extractKeyframesWithWorker')
    const report = await runKeyframeBenchmark({
      ...options(),
      execution: 'dom',
    })
    expect(report.settings).toMatchObject({
      execution: 'dom',
      jobs: 1,
      readerMode: null,
      maxReadBytes: null,
    })
    expect(report.rows[0]).toMatchObject({
      status: 'passed',
      frames: 1,
      readBytes: null,
      readCalls: null,
    })
    expect(bunny).not.toHaveBeenCalled()
    expect(report.peakActiveJobs).toBe(1)
  })
  test('bounds parallel jobs, retains ordinal order and dispatches each file once', async () => {
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(1)
    const releases: Array<() => void> = []
    const extract = vi
      .spyOn(worker, 'extractKeyframesWithWorker')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            releases.push(() =>
              resolve({
                frames: [new Blob(['jpg'], { type: 'image/jpeg' })],
                width: 160,
                height: 90,
                readBytes: 1024,
                readCalls: 1,
                metrics: emptyMetrics(),
              }),
            )
          }),
      )
    const files = Array.from(
      { length: 3 },
      (_, i) => new File(['x'], `secret-${i}.mp4`),
    )
    const sample = vi.fn()
    const running = runKeyframeBenchmark({
      ...options(),
      files,
      jobs: 2,
      onSample: sample,
    })
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases[1]()
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    expect(sample).not.toHaveBeenCalled()
    releases[2]()
    releases[0]()
    const report = await running
    expect(extract.mock.calls.map((call) => call[0])).toEqual(files)
    expect(report.rows.map((row) => row.file)).toEqual([1, 2, 3])
    expect(report.peakActiveJobs).toBe(2)
    expect(report.settings.jobs).toBe(2)
    expect(sample).toHaveBeenCalledOnce()
  })
  test('cancels both active jobs and never dispatches the remaining files', async () => {
    vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(1)
    const extract = vi
      .spyOn(worker, 'extractKeyframesWithWorker')
      .mockImplementation(
        (_file, _duration, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('private', 'AbortError')),
              { once: true },
            )
          }),
      )
    const controller = new AbortController()
    const running = runKeyframeBenchmark({
      ...options(),
      files: Array(3).fill(options().files[0]),
      jobs: 2,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(2))
    controller.abort()
    const report = await running
    expect(report.status).toBe('interrupted')
    expect(report.rows.map((row) => row.status)).toEqual(['aborted', 'aborted'])
    expect(extract).toHaveBeenCalledTimes(2)
  })
  test('bounds metadata preparation by the same per-file deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(dom, 'readPlayerDuration').mockImplementation(
      (_file, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('private', 'AbortError')),
            { once: true },
          )
        }),
    )
    const running = runKeyframeBenchmark(options())
    await vi.advanceTimersByTimeAsync(120000)
    const report = await running
    expect(report.status).toBe('failed')
    expect(report.rows[0].reason).toBe('deadline')
    expect(vi.getTimerCount()).toBe(0)
  })
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
