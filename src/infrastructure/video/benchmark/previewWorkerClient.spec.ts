import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractWithWorker } from './previewWorkerClient'
import { prepareTargets } from './previewExtraction'

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
  it('clones the File, validates completion and terminates', async () => {
    const worker = setup()
    const promise = extractWithWorker(
      file,
      prepared,
      new AbortController().signal,
    )
    expect(worker.postMessage).toHaveBeenCalledWith({ file, prepared })
    const output = {
      frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
      width: 320,
      height: 180,
      readBytes: 1,
      readCalls: 1,
    }
    worker.onmessage?.({ data: { ok: true, output } } as MessageEvent)
    await expect(promise).resolves.toEqual(output)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
  })
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
