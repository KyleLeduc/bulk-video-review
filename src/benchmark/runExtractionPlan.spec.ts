import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExtractionPlan } from './runExtractionBenchmark'
import { planSteps } from './extractionPlans'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as bunny from '../infrastructure/video/benchmark/previewWorkerClient'
import * as clips from '../infrastructure/video/benchmark/clipWorkerClient'
import { ExtractionError } from '../infrastructure/video/benchmark/previewExtraction'
import {
  emptyMetrics,
  prepareTargets,
} from '../infrastructure/video/benchmark/previewExtraction'

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
  it('runs and labels all four clip quality variants before publishing any samples', async () => {
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
      preset: 'clips-quality-v1',
      onClipSample: samples,
    })
    expect(result.status).toBe('completed')
    expect(extract.mock.calls.map((call) => call[2])).toEqual([10, 20, 24, 30])
    expect(
      result.results.map((entry) =>
        entry.report.mode === 'clip-extraction-custom-v1'
          ? entry.report.settings.frameRate
          : null,
      ),
    ).toEqual([10, 20, 24, 30])
    expect(samples).toHaveBeenCalledTimes(4)
    expect(samples.mock.calls.map((call) => call[1].frameRate)).toEqual([
      10, 20, 24, 30,
    ])
    expect(JSON.stringify(result)).not.toMatch(/private|"blob":|"start":/)
  })
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
