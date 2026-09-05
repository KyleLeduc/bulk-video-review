import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExtractionBenchmark } from './runExtractionBenchmark'
import * as dom from '../infrastructure/video/benchmark/domPreviewExtraction'
import * as candidate from '../infrastructure/video/benchmark/previewWorkerClient'

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
