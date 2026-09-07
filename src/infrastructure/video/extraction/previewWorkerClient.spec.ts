import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractWithWorker,
  extractKeyframesWithWorker,
} from './previewWorkerClient'
import { emptyMetrics, prepareTargets } from './previewExtraction'

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('disposable extraction worker', () => {
  const file = new File(['private'], 'private.mp4')
  const prepared = prepareTargets(10, 320, 180)
  function setup() {
    const worker = new FakeWorker()
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return worker
        }
      },
    )
    return worker
  }
  it('forwards seek progress and fails an observer without leaving its worker running', async () => {
    const worker = setup()
    const progress = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('observer')
      })
    const promise = extractKeyframesWithWorker(
      file,
      60,
      new AbortController().signal,
      160,
      progress,
    )
    void promise.catch(() => {})
    worker.onmessage?.({
      data: { type: 'progress', completed: 1, total: 4 },
    } as MessageEvent)
    expect(progress).toHaveBeenCalledWith({
      completed: 1,
      total: 4,
      diagnostics: {},
    })
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.onmessage?.({
      data: { type: 'progress', completed: 2, total: 4 },
    } as MessageEvent)
    await expect(promise).rejects.toThrow('observer')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('clones the File, validates completion and terminates', async () => {
    const worker = setup()
    const promise = extractWithWorker(
      file,
      prepared,
      new AbortController().signal,
    )
    expect(worker.postMessage).toHaveBeenCalledWith({
      file,
      prepared,
      readerMode: 'direct',
    })
    const output = {
      metrics: { ...emptyMetrics(), readMs: 0, readMaxMs: 0 },
      frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
      width: 320,
      height: 180,
      readBytes: 1,
      readCalls: 1,
    }
    worker.onmessage?.({ data: { ok: true, output } } as MessageEvent)
    await expect(promise).resolves.toEqual(output)
    expect(output.metrics.workerOverheadMs).toBeGreaterThanOrEqual(0)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
  })
  it.each(['valid', 'short', 'oversized', 'warning'] as const)(
    'validates the distinct keyframe reply (%s)',
    async (kind) => {
      const worker = setup()
      const promise = extractKeyframesWithWorker(
        file,
        60,
        new AbortController().signal,
        160,
      )
      expect(worker.postMessage).toHaveBeenCalledWith({
        file,
        kind: 'keyframes',
        duration: 60,
        maxWidth: 160,
      })
      const output = {
        metrics: { ...emptyMetrics(), readMs: 1, readMaxMs: 1 },
        frames: Array(kind === 'short' ? 3 : 4).fill(
          new Blob(['jpeg'], { type: 'image/jpeg' }),
        ),
        width: kind === 'oversized' ? 320 : 160,
        height: 90,
        readBytes: 4,
        readCalls: 1,
      }
      worker.onmessage?.({
        data:
          kind === 'warning'
            ? { ok: false, reason: 'unsupported-timeline' }
            : { ok: true, output },
      } as MessageEvent)
      if (kind === 'valid') await expect(promise).resolves.toMatchObject(output)
      else
        await expect(promise).rejects.toThrow(
          kind === 'warning' ? 'unsupported-timeline' : 'output-invalid',
        )
      expect(worker.terminate).toHaveBeenCalledOnce()
    },
  )
  it.each(['abort', 'deadline'] as const)(
    'retires a keyframe worker on %s and ignores late replies',
    async (reason) => {
      vi.useFakeTimers()
      const worker = setup()
      const controller = new AbortController()
      const pending = extractKeyframesWithWorker(file, 60, controller.signal)
      const late = worker.onmessage
      const rejection = expect(pending).rejects.toMatchObject(
        reason === 'abort' ? { name: 'AbortError' } : { message: 'deadline' },
      )
      if (reason === 'abort') controller.abort()
      else await vi.advanceTimersByTimeAsync(120000)
      await rejection
      late?.({ data: { ok: false, reason: 'private' } } as MessageEvent)
      expect(worker.terminate).toHaveBeenCalledOnce()
    },
  )
  it('terminates when cancelled, including before startup', async () => {
    const worker = setup()
    const controller = new AbortController()
    const promise = extractWithWorker(file, prepared, controller.signal)
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.terminate.mockClear()
    await expect(
      extractWithWorker(file, prepared, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })
  it('forwards the explicit buffered reader selection', async () => {
    const worker = setup()
    const controller = new AbortController()
    const promise = extractWithWorker(
      file,
      prepared,
      controller.signal,
      'buffered-1mib',
    )
    expect(worker.postMessage).toHaveBeenCalledWith({
      file,
      prepared,
      readerMode: 'buffered-1mib',
    })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('terminates at the deadline even without a worker reply', async () => {
    vi.useFakeTimers()
    const worker = setup()
    const promise = extractWithWorker(
      file,
      prepared,
      new AbortController().signal,
    )
    const rejection = expect(promise).rejects.toThrow('deadline')
    await vi.advanceTimersByTimeAsync(120000)
    await rejection
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('rejects candidate replies missing actual read counters', async () => {
    const worker = setup()
    const promise = extractWithWorker(
      file,
      prepared,
      new AbortController().signal,
    )
    worker.onmessage?.({
      data: {
        ok: true,
        output: {
          metrics: { ...emptyMetrics(), readMs: 0, readMaxMs: 0 },
          frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
          width: 320,
          height: 180,
          readBytes: null,
          readCalls: null,
        },
      },
    } as MessageEvent)
    await expect(promise).rejects.toThrow('output-invalid')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it.each(['malformed', 'error', 'messageerror'])(
    'handles %s without leaking details',
    async (kind) => {
      const worker = setup()
      const promise = extractWithWorker(
        file,
        prepared,
        new AbortController().signal,
      )
      if (kind === 'malformed')
        worker.onmessage?.({
          data: { ok: false, reason: 'secret.mp4' },
        } as MessageEvent)
      else if (kind === 'error') worker.onerror?.()
      else worker.onmessageerror?.()
      await expect(promise).rejects.toThrow('extraction-failed')
      expect(worker.terminate).toHaveBeenCalledOnce()
    },
  )
})
