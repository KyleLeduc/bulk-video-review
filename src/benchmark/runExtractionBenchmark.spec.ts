import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExtractionBenchmark } from './runExtractionBenchmark'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as candidate from '../infrastructure/video/benchmark/previewWorkerClient'
import { emptyMetrics } from '../infrastructure/video/benchmark/previewExtraction'

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
  function setup() {
    const order: string[] = []
    vi.spyOn(dom, 'prepareFile').mockResolvedValue(prepared)
    vi.spyOn(dom, 'extractWithDom').mockImplementation(async () => {
      order.push('dom')
      return output
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
    expect(result.schemaVersion).toBe(2)
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
  it('settles active concurrent jobs on cancellation without launching the queue', async () => {
    setup()
    const controller = new AbortController()
    let active = 0
    vi.spyOn(candidate, 'extractWithWorker').mockImplementation(
      async (_file, _prepared, signal) => {
        active++
        if (active === 2) queueMicrotask(() => controller.abort())
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancel', 'AbortError')),
          ),
        )
        return output
      },
    )
    const result = await runExtractionBenchmark({
      files: [file, file, file, file],
      selectionId: 'selection',
      repetitions: 2,
      execution: 'mediabunny',
      jobs: 2,
      build: { revision: null, dirty: null, assetsSha256: null },
      signal: controller.signal,
    })
    expect(result.status).toBe('interrupted')
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((row) => row.status === 'aborted')).toBe(true)
    expect(result.batches).toHaveLength(1)
  })
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
