import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExtractionPlan } from './runExtractionBenchmark'
import { planSteps } from './extractionPlans'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as bunny from '../infrastructure/video/extraction/previewWorkerClient'
import * as clips from '../infrastructure/video/extraction/clipWorkerClient'
import { ExtractionError } from '../infrastructure/video/extraction/previewExtraction'
import {
  emptyMetrics,
  prepareTargets,
} from '../infrastructure/video/extraction/previewExtraction'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const options = () => ({
  preset: 'confirmation-v1' as const,
  files: [new File(['private'], 'secret.mp4')],
  selectionId: 'selection',
  build: { revision: null, dirty: null, assetsSha256: null },
  signal: new AbortController().signal,
})
function setup() {
  const order: string[] = []
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const request = vi.fn(async (_name, _options, fn) => fn({}))
  vi.stubGlobal('navigator', { userAgent: 'test', locks: { request } })
  const prepared = prepareTargets(10, 320, 180)
  vi.spyOn(dom, 'prepareFile').mockResolvedValue(prepared)
  for (const backend of ['dom', 'mediabunny'] as const) {
    const extract = async () => {
      order.push(backend)
      return {
        width: 320,
        height: 180,
        frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
        readBytes: backend === 'dom' ? null : 4,
        readCalls: backend === 'dom' ? null : 1,
        metrics: emptyMetrics(),
      }
    }
    if (backend === 'dom')
      vi.spyOn(dom, 'extractWithDom').mockImplementation(extract)
    else vi.spyOn(bunny, 'extractWithWorker').mockImplementation(extract)
  }
  return { order, request }
}
describe('versioned extraction plans', () => {
  it('preserves safe clip failure evidence in the exported plan', async () => {
    setup()
    vi.spyOn(clips, 'extractClipsWithWorker').mockRejectedValue(
      new ExtractionError('read-limit', {
        stage: 'decode',
        readBytes: 1000000000,
        readCalls: 954,
        ...{ message: 'private details', path: 'private.mp4' },
      }),
    )
    const report = await runExtractionPlan({
      ...options(),
      preset: 'clips-3s-v1',
    })
    expect(report.results[0].report.rows[0]).toMatchObject({
      status: 'failed',
      reason: 'read-limit',
      diagnostics: { stage: 'decode', readBytes: 1000000000, readCalls: 954 },
    })
    expect(JSON.stringify(report)).not.toMatch(/private|"path"|"message"/)
  })
  it.each([false, true])(
    'compares seek backends with matched recipes, reversed passes and two bounded samples (bunny fails=%s)',
    async (fails) => {
      const { request } = setup()
      vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(30)
      const output = {
        frames: Array(2).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
        width: 160,
        height: 90,
        readBytes: 1024,
        readCalls: 1,
        metrics: emptyMetrics(),
      }
      const native = vi
        .spyOn(dom, 'extractKeyframesWithDom')
        .mockResolvedValue({ ...output, readBytes: null, readCalls: null })
      const candidate = vi
        .spyOn(bunny, 'extractKeyframesWithWorker')
        .mockImplementation(async () => {
          if (fails) throw new ExtractionError('unsupported-timeline')
          return output
        })
      const sample = vi.fn<
        NonNullable<Parameters<typeof runExtractionPlan>[0]['onKeyframeSample']>
      >(() => {
        expect(native).toHaveBeenCalledTimes(4)
        expect(candidate).toHaveBeenCalledTimes(4)
      })
      const result = await runExtractionPlan({
        ...options(),
        preset: 'seek-backends-v1',
        onKeyframeSample: sample,
      })
      expect(request).toHaveBeenCalledOnce()
      expect(result.results).toHaveLength(8)
      expect(result.status).toBe(fails ? 'failed' : 'completed')
      const first = result.plannedSteps.slice(0, 4)
      expect(first.map((step) => [step.execution, step.jobs])).toEqual([
        ['mediabunny', 1],
        ['dom', 1],
        ['mediabunny', 2],
        ['dom', 2],
      ])
      expect(result.plannedSteps.slice(4).map((step) => step.id)).toEqual(
        first.map((step) => step.id).reverse(),
      )
      expect(
        result.plannedSteps.every(
          (step) => step.workload === 'keyframes' && step.maxWidth === 160,
        ),
      ).toBe(true)
      for (const entry of result.results) {
        expect(entry.report.settings).toMatchObject({
          jobs: entry.step.jobs,
          execution: entry.step.execution,
          maxWidth: 160,
          quality: 0.72,
          samplingPolicy: '15s-max100',
        })
        expect(entry.report.rows[0].status).toBe(
          fails && entry.step.execution === 'mediabunny' ? 'failed' : 'passed',
        )
      }
      expect(sample).toHaveBeenCalledTimes(fails ? 1 : 2)
      expect(
        sample.mock.calls.every(
          ([value, step]) =>
            value.file === 1 && step.pass === 1 && step.jobs === 1,
        ),
      ).toBe(true)
      expect(JSON.stringify(result)).not.toMatch(
        /secret|private|blob:|"targets"/,
      )
    },
  )
  it.each([false, true])(
    'keeps one fixed source and defers mixed-plan media (interrupted=%s)',
    async (interrupted) => {
      const { request } = setup()
      const controller = new AbortController()
      vi.spyOn(dom, 'readPlayerDuration').mockResolvedValue(30)
      const clip = vi.spyOn(clips, 'extractClipsWithWorker').mockResolvedValue({
        clips: [
          {
            blob: new Blob(['clip'], { type: 'video/mp4' }),
            start: 0,
            duration: 1.5,
          },
        ],
        codec: 'avc',
        width: 320,
        height: 180,
        readBytes: 1,
        readCalls: 1,
        metrics: {
          setupMs: 0,
          conversionMs: 1,
          firstClipMs: 1,
          totalMs: 1,
          readMs: 0,
          readMaxMs: 0,
        },
      })
      const extract = vi
        .spyOn(bunny, 'extractKeyframesWithWorker')
        .mockImplementation(async (_file, _duration, _signal, width) => {
          if (interrupted && width === 160) {
            controller.abort()
            throw new DOMException('Stop', 'AbortError')
          }
          return {
            frames: Array(2).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
            width: width!,
            height: 90,
            readBytes: 1024,
            readCalls: 1,
            metrics: emptyMetrics(),
          }
        })
      const sample = vi.fn<
        NonNullable<Parameters<typeof runExtractionPlan>[0]['onKeyframeSample']>
      >(() => expect(extract).toHaveBeenCalledTimes(6))
      const clipSample = vi.fn<
        NonNullable<Parameters<typeof runExtractionPlan>[0]['onClipSample']>
      >(() => expect(extract).toHaveBeenCalledTimes(6))
      const result = await runExtractionPlan({
        ...options(),
        files: [...options().files, new File(['other'], 'other.mp4')],
        preset: 'motion-keyframes-quality-v1',
        signal: controller.signal,
        onClipSample: clipSample,
        onKeyframeSample: sample,
      })
      expect(request).toHaveBeenCalledOnce()
      expect(clip.mock.calls[0][4]).toEqual({ kind: 'motion', duration: 30 })
      if (interrupted) {
        expect(result.status).toBe('interrupted')
        expect(result.results.length).toBe(3)
        expect(sample).not.toHaveBeenCalled()
        expect(clipSample).not.toHaveBeenCalled()
      } else {
        expect(result.status).toBe('completed')
        expect(result.results).toHaveLength(4)
        expect(sample).toHaveBeenCalledTimes(3)
        expect(sample.mock.calls.every((call) => call[0].file === 1)).toBe(true)
        expect(clipSample.mock.calls[0]?.[0]).toMatchObject({ file: 1 })
      }
    },
  )
  it('defines a fixed production motion step and three keyframe quality widths', () => {
    const steps = planSteps('motion-keyframes-quality-v1')
    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatchObject({
      workload: 'clips',
      frameRate: 20,
      clipSeconds: 1.5,
      production: true,
      jobs: 1,
    })
    expect(
      steps.slice(1).map((step) => ('maxWidth' in step ? step.maxWidth : null)),
    ).toEqual([120, 160, 240])
    expect(steps.every((step) => step.jobs === 1 && step.pass === 1)).toBe(true)
  })
  it.each(['clips-quality-v1', 'clips-duration-v1'] as const)(
    'runs and labels all four %s variants before publishing any samples',
    async (preset) => {
      setup()
      const extract = vi
        .spyOn(clips, 'extractClipsWithWorker')
        .mockResolvedValue({
          clips: [
            {
              blob: new Blob(['private'], { type: 'video/mp4' }),
              start: 0,
              duration: 3,
            },
          ],
          width: 320,
          height: 180,
          codec: 'avc',
          readBytes: 4,
          readCalls: 1,
          metrics: {
            setupMs: 1,
            conversionMs: 2,
            firstClipMs: 3,
            totalMs: 4,
            readMs: 1,
            readMaxMs: 1,
          },
        })
      const samples = vi.fn<
        NonNullable<Parameters<typeof runExtractionPlan>[0]['onClipSample']>
      >(() => expect(extract).toHaveBeenCalledTimes(4))
      const result = await runExtractionPlan({
        ...options(),
        preset,
        onClipSample: samples,
      })
      expect(result.status).toBe('completed')
      const frameRates =
        preset === 'clips-duration-v1' ? [20, 20, 20, 20] : [10, 20, 24, 30]
      const durations =
        preset === 'clips-duration-v1' ? [0.5, 1, 1.5, 2] : [3, 3, 3, 3]
      expect(extract.mock.calls.map((call) => call[2])).toEqual(frameRates)
      expect(extract.mock.calls.map((call) => call[3])).toEqual(durations)
      expect(
        result.results.map((entry) =>
          entry.report.mode === 'clip-extraction-custom-v1'
            ? entry.report.settings.clipSeconds
            : null,
        ),
      ).toEqual(durations)
      expect(
        result.results.map((entry) =>
          entry.report.mode === 'clip-extraction-custom-v1'
            ? entry.report.settings.frameRate
            : null,
        ),
      ).toEqual(frameRates)
      expect(samples).toHaveBeenCalledTimes(4)
      expect(samples.mock.calls.map((call) => call[1].frameRate)).toEqual(
        frameRates,
      )
      expect(new Set(result.plannedSteps.map((step) => step.id)).size).toBe(4)
      expect(JSON.stringify(result)).not.toMatch(/private|"blob":|"start":/)
    },
  )
  it('covers the full matrix with balanced reversed passes', () => {
    const steps = planSteps('still-matrix-v1')
    expect(steps).toHaveLength(16)
    expect(steps.slice(8).map((s) => s.id)).toEqual(
      steps
        .slice(0, 8)
        .map((s) => s.id)
        .reverse(),
    )
    expect(planSteps('clips-3s-v1')).toHaveLength(1)
  })
  it('holds one lock, retains ordered reports and publishes samples only after all timing', async () => {
    const { order, request } = setup()
    const completed: number[] = []
    const result = await runExtractionPlan({
      ...options(),
      onStep: (_, index) => completed.push(index),
      onSamples: () => expect(order).toHaveLength(4),
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['mediabunny', 'dom', 'dom', 'mediabunny'])
    expect(completed).toEqual([1, 2, 3, 4])
    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(4)
    expect(result.identity.cacheScope).not.toMatch(/NAS|reversed second pass/)
    expect(JSON.stringify(result)).not.toMatch(/secret|private|blob:|targets/)
  })
  it('keeps completed evidence when stopped between steps', async () => {
    setup()
    const controller = new AbortController()
    const result = await runExtractionPlan({
      ...options(),
      signal: controller.signal,
      onStep: () => controller.abort(),
    })
    expect(result.status).toBe('interrupted')
    expect(result.results).toHaveLength(1)
  })
  it('stops the whole plan if the tab becomes hidden between steps', async () => {
    setup()
    const result = await runExtractionPlan({
      ...options(),
      onStep: () => {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
      },
    })
    expect(result.status).toBe('interrupted')
    expect(result.hidden).toBe(true)
    expect(result.results).toHaveLength(1)
  })
  it('refuses a competing suite', async () => {
    setup()
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _opts: unknown,
          fn: (lock: null) => unknown,
        ) => fn(null),
      },
    })
    await expect(runExtractionPlan(options())).rejects.toThrow(
      'Another benchmark',
    )
  })
  it('retains failures and continues remaining configurations without fallback', async () => {
    const { order } = setup()
    vi.mocked(bunny.extractWithWorker).mockRejectedValue(
      new ExtractionError('read-limit'),
    )
    const result = await runExtractionPlan(options())
    expect(result.status).toBe('failed')
    expect(result.results).toHaveLength(4)
    expect(result.results.map((entry) => entry.report.status)).toEqual([
      'failed',
      'completed',
      'completed',
      'failed',
    ])
    expect(order).toEqual(['dom', 'dom'])
    expect(result.results[0].report.rows[0].reason).toBe('read-limit')
  })
  it('retains successful clip jobs before a failure without leaking clip locations or bytes', async () => {
    setup()
    const output = {
      clips: [
        {
          blob: new Blob(['secret clip'], { type: 'video/mp4' }),
          start: 17,
          duration: 3,
        },
      ],
      width: 320,
      height: 180,
      codec: 'avc' as const,
      readBytes: 100,
      readCalls: 1,
      metrics: {
        setupMs: 1,
        conversionMs: 2,
        firstClipMs: 3,
        totalMs: 4,
        readMs: 1,
        readMaxMs: 1,
      },
    }
    vi.spyOn(clips, 'extractClipsWithWorker')
      .mockResolvedValueOnce(output)
      .mockRejectedValueOnce(new ExtractionError('unsupported'))
    const sample = vi.fn()
    const opts = options()
    const result = await runExtractionPlan({
      ...opts,
      preset: 'clips-3s-v1',
      files: [...opts.files, ...opts.files],
      onClipSample: sample,
    })
    expect(result.status).toBe('failed')
    expect(result.identity.cacheScope).not.toMatch(/NAS|reversed second pass/)
    expect(result.results[0].report.identity.cacheScope).not.toContain('NAS')
    expect(result.results[0].report.rows.map((row) => row.status)).toEqual([
      'passed',
      'failed',
    ])
    expect(sample).toHaveBeenCalledWith(
      { file: 1, output },
      planSteps('clips-3s-v1')[0],
    )
    expect(JSON.stringify(result)).not.toMatch(
      /secret|"start":|"duration":|"blob":/,
    )
  })
  it('cancels an active clip job and does not dispatch queued files', async () => {
    setup()
    const controller = new AbortController()
    const extract = vi
      .spyOn(clips, 'extractClipsWithWorker')
      .mockImplementation(async () => {
        controller.abort()
        throw new DOMException('Cancelled', 'AbortError')
      })
    const opts = options()
    const sample = vi.fn()
    const result = await runExtractionPlan({
      ...opts,
      preset: 'clips-3s-v1',
      files: [...opts.files, ...opts.files],
      signal: controller.signal,
      onClipSample: sample,
    })
    expect(result.status).toBe('interrupted')
    expect(result.results[0].report.rows).toHaveLength(1)
    expect(result.results[0].report.rows[0].status).toBe('aborted')
    expect(extract).toHaveBeenCalledOnce()
    expect(sample).not.toHaveBeenCalled()
  })
})
