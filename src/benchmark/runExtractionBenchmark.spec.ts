import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExtractionBenchmark } from './runExtractionBenchmark'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as candidate from '../infrastructure/video/benchmark/previewWorkerClient'
import {
  emptyMetrics,
  prepareTargets,
} from '../infrastructure/video/benchmark/previewExtraction'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('serial custom extraction comparison', () => {
  const file = new File(['private content'], 'private-name.mp4')
  const prepared = {
    targets: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    width: 320,
    height: 180,
  }
  const output = {
    metrics: emptyMetrics(),
    frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
    width: 320,
    height: 180,
    readBytes: 4,
    readCalls: 1,
  }
  const domOutput = { ...output, readBytes: null, readCalls: null }
  function setup() {
    const order: string[] = []
    vi.spyOn(dom, 'prepareFile').mockResolvedValue(prepared)
    vi.spyOn(dom, 'extractWithDom').mockImplementation(async () => {
      order.push('dom')
      return domOutput
    })
    vi.spyOn(candidate, 'extractWithWorker').mockImplementation(async () => {
      order.push('mediabunny')
      return output
    })
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      locks: { request: vi.fn(async (_name, _options, fn) => fn({})) },
    })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    return order
  }
  function run(signal = new AbortController().signal) {
    return runExtractionBenchmark({
      files: [file],
      selectionId: 'selection',
      repetitions: 2,
      signal,
      build: { revision: null, dirty: null, assetsSha256: null },
    })
  }
  it('reuses targets, alternates backend order, and exports no private inputs or images', async () => {
    const order = setup()
    const result = await run()
    expect(order).toEqual(['dom', 'mediabunny', 'mediabunny', 'dom'])
    expect(dom.prepareFile).toHaveBeenCalledTimes(1)
    expect(dom.extractWithDom).toHaveBeenCalledWith(
      file,
      prepared,
      expect.any(AbortSignal),
    )
    expect(result.rows).toHaveLength(4)
    expect(result.status).toBe('completed')
    const json = JSON.stringify(result)
    for (const secret of [
      'private-name',
      'private content',
      'targets',
      'frames":[',
      'blob',
      'timestampSeconds',
    ])
      expect(json).not.toContain(secret)
    expect(result.selection.sizes).toEqual([file.size])
    expect(result.schemaVersion).toBe(4)
    expect(result.settings).toMatchObject({
      previewCount: 9,
      samplingPolicy: 'integer-deciles',
      maxReadBytes: 256 * 1024 * 1024,
      maxOutputBytes: 16 * 1024 * 1024,
    })
    expect(result.settings.readerMode).toBe('direct')
  })
  it('records and forwards buffered selection, but reports null for DOM-only', async () => {
    setup()
    for (const execution of ['mediabunny', 'dom'] as const) {
      const result = await runExtractionBenchmark({
        files: [file],
        selectionId: 'selection',
        repetitions: 1,
        execution,
        readerMode: 'buffered-1mib',
        build: { revision: null, dirty: null, assetsSha256: null },
        signal: new AbortController().signal,
      })
      expect(result.settings.readerMode).toBe(
        execution === 'dom' ? null : 'buffered-1mib',
      )
    }
    expect(candidate.extractWithWorker).toHaveBeenCalledWith(
      file,
      prepared,
      expect.any(AbortSignal),
      'buffered-1mib',
    )
  })
  it.each(['dom', 'mediabunny'] as const)(
    'prepares dense targets once and runs four bounded jobs for %s',
    async (execution) => {
      setup()
      vi.mocked(dom.prepareFile).mockImplementation(
        async (_file, _signal, count) => prepareTargets(5, 320, 180, count),
      )
      let active = 0
      let peak = 0
      const extract = async (_file: File, targets: { targets: number[] }) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active--
        return {
          ...(execution === 'dom' ? domOutput : output),
          frames: targets.targets.map(() => output.frames[0]),
        }
      }
      vi.mocked(dom.extractWithDom).mockImplementation(extract)
      vi.mocked(candidate.extractWithWorker).mockImplementation(extract)
      const samples = vi.fn()
      const result = await runExtractionBenchmark({
        files: Array(6).fill(file),
        selectionId: 'selection',
        repetitions: 2,
        execution,
        jobs: 4,
        previewCount: 100,
        readerMode: 'buffered-1mib',
        build: { revision: null, dirty: null, assetsSha256: null },
        signal: new AbortController().signal,
        onSamples: samples,
      })
      expect(result.status).toBe('completed')
      expect(peak).toBe(4)
      expect(active).toBe(0)
      expect(result.settings).toMatchObject({
        jobs: 4,
        previewCount: 100,
        samplingPolicy: 'fractional-even',
        maxReadBytes: execution === 'dom' ? null : 1024 * 1024 * 1024,
      })
      expect(dom.prepareFile).toHaveBeenCalledTimes(6)
      expect(dom.prepareFile).toHaveBeenCalledWith(
        file,
        expect.any(AbortSignal),
        100,
      )
      expect(result.rows).toHaveLength(12)
      expect(
        result.rows.every(
          (row) => row.frames === 100 && row.backend === execution,
        ),
      ).toBe(true)
      expect(
        result.batches.map((batch) => [batch.peakActiveJobs, batch.completed]),
      ).toEqual([
        [4, 6],
        [4, 6],
      ])
      expect(result.rows[6].startedAtMs).toBeGreaterThanOrEqual(
        Math.max(...result.rows.slice(0, 6).map((row) => row.finishedAtMs)),
      )
      expect(samples).toHaveBeenCalledOnce()
      expect(samples.mock.calls[0][0]).toHaveLength(1)
      expect(samples.mock.calls[0][0][0].row).toMatchObject({
        file: 6,
        repetition: 2,
      })
    },
  )
  it.each([
    'readBytes',
    'readCalls',
    'readMs',
    'readMaxMs',
    'workerOverheadMs',
  ] as const)('rejects fabricated DOM %s evidence', async (field) => {
    setup()
    const invalid = { ...domOutput, metrics: { ...domOutput.metrics } }
    if (field === 'readBytes' || field === 'readCalls')
      Object.assign(invalid, { [field]: 1 })
    else invalid.metrics[field] = 1
    vi.mocked(dom.extractWithDom).mockResolvedValue(invalid)
    const result = await run()
    expect(result.status).toBe('failed')
    expect(
      result.rows
        .filter((row) => row.backend === 'dom')
        .every(
          (row) => row.reason === 'output-invalid' && row.metrics === null,
        ),
    ).toBe(true)
  })
  it('rejects invalid reader selection before preparing files', async () => {
    setup()
    await expect(
      runExtractionBenchmark({
        files: [file],
        selectionId: 'selection',
        repetitions: 1,
        readerMode: 'unknown' as never,
        build: { revision: null, dirty: null, assetsSha256: null },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow()
    expect(dom.prepareFile).not.toHaveBeenCalled()
  })
  it('runs only the selected backend with two bounded jobs and records actual batch elapsed time', async () => {
    setup()
    let active = 0
    let peak = 0
    vi.spyOn(candidate, 'extractWithWorker').mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active--
      return output
    })
    const result = await runExtractionBenchmark({
      files: [file, file, file, file],
      selectionId: 'selection',
      repetitions: 2,
      execution: 'mediabunny',
      jobs: 2,
      build: { revision: null, dirty: null, assetsSha256: null },
      signal: new AbortController().signal,
    })
    expect(peak).toBe(2)
    expect(dom.extractWithDom).not.toHaveBeenCalled()
    expect(result.rows).toHaveLength(8)
    expect(result.rows.map((row) => row.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(result.batches).toHaveLength(2)
    for (const batch of result.batches) {
      expect(batch.peakActiveJobs).toBe(2)
      expect(batch.completed).toBe(4)
      const rows = result.rows.filter(
        (row) => row.repetition === batch.repetition,
      )
      expect(batch.wallMs).toBeLessThan(
        rows.reduce((sum, row) => sum + row.wallMs, 0),
      )
      expect(rows[1].startedAtMs).toBeLessThan(rows[0].finishedAtMs)
    }
    expect(result.rows[4].startedAtMs).toBeGreaterThanOrEqual(
      result.rows[3].finishedAtMs,
    )
    expect(result.schemaVersion).toBe(4)
  })
  it('defers bounded sample publication until all jobs finish', async () => {
    const order = setup()
    const samples: string[] = []
    const onRow = vi.fn()
    const result = await runExtractionBenchmark({
      files: [file, file],
      selectionId: 'selection',
      repetitions: 1,
      build: { revision: null, dirty: null, assetsSha256: null },
      signal: new AbortController().signal,
      onRow,
      onSamples: (pair) => {
        expect(order).toHaveLength(4)
        samples.push(
          ...pair.map((item) => `${item.row.file}:${item.row.backend}`),
        )
      },
    })
    expect(result.status).toBe('completed')
    expect(samples).toEqual(['2:dom', '2:mediabunny'])
    expect(onRow.mock.calls.every((args) => args.length === 1)).toBe(true)
  })
  it('rejects unsafe job counts and concurrent paired comparisons before preparing files', async () => {
    setup()
    for (const options of [
      { execution: 'paired', jobs: 2 },
      { execution: 'dom', jobs: 3 },
      { execution: 'mediabunny', jobs: 8 },
      { execution: 'paired', jobs: 4 },
      { execution: 'dom', previewCount: 101 },
    ]) {
      await expect(
        runExtractionBenchmark({
          files: [file],
          selectionId: 'selection',
          repetitions: 1,
          build: { revision: null, dirty: null, assetsSha256: null },
          signal: new AbortController().signal,
          ...options,
        } as Parameters<typeof runExtractionBenchmark>[0]),
      ).rejects.toThrow()
    }
    expect(dom.prepareFile).not.toHaveBeenCalled()
  })
  it.each([2, 4] as const)(
    'settles %s active jobs on cancellation without launching the queue',
    async (jobs) => {
      setup()
      const controller = new AbortController()
      let active = 0
      vi.spyOn(candidate, 'extractWithWorker').mockImplementation(
        async (_file, _prepared, signal) => {
          active++
          if (active === jobs) queueMicrotask(() => controller.abort())
          await new Promise<void>((_resolve, reject) =>
            signal.addEventListener('abort', () =>
              reject(new DOMException('cancel', 'AbortError')),
            ),
          )
          return output
        },
      )
      const result = await runExtractionBenchmark({
        files: Array(6).fill(file),
        selectionId: 'selection',
        repetitions: 2,
        execution: 'mediabunny',
        jobs,
        build: { revision: null, dirty: null, assetsSha256: null },
        signal: controller.signal,
      })
      expect(result.status).toBe('interrupted')
      expect(result.rows).toHaveLength(jobs)
      expect(result.rows.every((row) => row.status === 'aborted')).toBe(true)
      expect(result.batches).toHaveLength(1)
    },
  )
  it('records candidate failure without DOM fallback or dropping the row', async () => {
    const order = setup()
    vi.spyOn(candidate, 'extractWithWorker').mockRejectedValue(
      new Error('secret path'),
    )
    const result = await run()
    expect(result.status).toBe('failed')
    expect(
      result.rows
        .filter((row) => row.backend === 'mediabunny')
        .every((row) => row.reason === 'extraction-failed'),
    ).toBe(true)
    expect(order).toEqual(['dom', 'dom'])
    expect(JSON.stringify(result)).not.toContain('secret path')
  })
  it('retains all numeric evidence when a display callback fails', async () => {
    setup()
    const result = await runExtractionBenchmark({
      files: [file],
      selectionId: 'selection',
      repetitions: 1,
      build: { revision: null, dirty: null, assetsSha256: null },
      signal: new AbortController().signal,
      onRow: () => {
        throw new Error('private display error')
      },
    })
    expect(result.rows).toHaveLength(2)
    expect(result.status).toBe('failed')
    expect(result.errors).toEqual(['display-failed'])
    expect(JSON.stringify(result)).not.toContain('private display error')
  })
  it('invalidates and stops when the document becomes hidden', async () => {
    setup()
    vi.spyOn(dom, 'extractWithDom').mockImplementation(async () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
      return output
    })
    const result = await run()
    expect(result.status).toBe('interrupted')
    expect(result.hidden).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].status).toBe('aborted')
    expect(candidate.extractWithWorker).not.toHaveBeenCalled()
  })
  it('does no work when cancelled before start or when the shared lock is unavailable', async () => {
    setup()
    const controller = new AbortController()
    controller.abort()
    expect((await run(controller.signal)).status).toBe('interrupted')
    expect(dom.prepareFile).not.toHaveBeenCalled()
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          fn: (lock: null) => unknown,
        ) => fn(null),
      },
    })
    await expect(run()).rejects.toThrow('Another benchmark')
    expect(dom.prepareFile).not.toHaveBeenCalled()
  })
})
