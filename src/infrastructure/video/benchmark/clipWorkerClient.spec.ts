import { afterEach, expect, it, vi } from 'vitest'
import { extractClipsWithWorker } from './clipWorkerClient'

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
const file = new File(['private'], 'private.mp4')
it.each([10, 20, 24, 30] as const)(
  'sends the chosen %i FPS to the worker',
  async (fps) => {
    const worker = setup()
    const controller = new AbortController()
    const promise = extractClipsWithWorker(file, controller.signal, fps)
    expect(worker.postMessage).toHaveBeenCalledWith({ file, frameRate: fps })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  },
)
it.each([0, 60, NaN, '24', null])(
  'rejects invalid frame rate %s before dispatch',
  async (fps) => {
    const worker = setup()
    await expect(
      extractClipsWithWorker(file, new AbortController().signal, fps as never),
    ).rejects.toThrow('invalid-metadata')
    expect(worker.postMessage).not.toHaveBeenCalled()
  },
)
it('validates clips and terminates the disposable worker', async () => {
  const worker = setup()
  const promise = extractClipsWithWorker(file, new AbortController().signal)
  const output = {
    clips: [
      { blob: new Blob(['mp4'], { type: 'video/mp4' }), start: 0, duration: 3 },
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
  }
  worker.onmessage?.({ data: { ok: true, output } } as MessageEvent)
  await expect(promise).resolves.toEqual(output)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
})
it('terminates on abort and never starts when already aborted', async () => {
  const worker = setup()
  const controller = new AbortController()
  const promise = extractClipsWithWorker(file, controller.signal)
  controller.abort()
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  await expect(
    extractClipsWithWorker(file, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(worker.postMessage).toHaveBeenCalledOnce()
  expect(worker.terminate).toHaveBeenCalledOnce()
})
it('terminates hung work at 120 seconds', async () => {
  vi.useFakeTimers()
  const worker = setup()
  const rejection = expect(
    extractClipsWithWorker(file, new AbortController().signal),
  ).rejects.toThrow('deadline')
  await vi.advanceTimersByTimeAsync(120000)
  await rejection
  expect(worker.terminate).toHaveBeenCalledOnce()
})
it.each(['bad-output', 'unsupported', 'private.mp4', 'error'])(
  'sanitizes %s and releases the worker',
  async (kind) => {
    const worker = setup()
    const promise = extractClipsWithWorker(file, new AbortController().signal)
    if (kind === 'error') worker.onerror?.()
    else
      worker.onmessage?.({
        data:
          kind === 'bad-output'
            ? { ok: true, output: {} }
            : { ok: false, reason: kind },
      } as MessageEvent)
    await expect(promise).rejects.toThrow(
      kind === 'unsupported'
        ? 'unsupported'
        : kind === 'bad-output'
          ? 'output-invalid'
          : 'extraction-failed',
    )
    expect(worker.terminate).toHaveBeenCalledOnce()
  },
)
