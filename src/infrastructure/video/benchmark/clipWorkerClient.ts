import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  workerFailure,
} from './previewExtraction'
import {
  CLIP_FPS,
  validateClipFrameRate,
  validateClipOutput,
  type ClipFrameRate,
  type ClipOutput,
} from './clipExtraction'

export function extractClipsWithWorker(
  file: File,
  signal: AbortSignal,
  frameRate: ClipFrameRate = CLIP_FPS,
): Promise<ClipOutput> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'))
      return
    }
    validateClipFrameRate(frameRate)
    let worker: Worker
    try {
      worker = new Worker(
        new URL('./clipExtraction.worker.ts', import.meta.url),
        { type: 'module' },
      )
    } catch {
      reject(new ExtractionError('unsupported'))
      return
    }
    let settled = false
    const finish = (output?: ClipOutput, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      if (output) resolve(output)
      else reject(error)
    }
    const abort = () =>
      finish(undefined, new DOMException('Cancelled', 'AbortError'))
    const timer = setTimeout(
      () => finish(undefined, new ExtractionError('deadline')),
      EXTRACTION_DEADLINE_MS,
    )
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = worker.onmessageerror = () =>
      finish(undefined, new ExtractionError('extraction-failed'))
    worker.onmessage = (event) => {
      try {
        if (event.data?.ok !== true) throw workerFailure(event.data?.reason)
        finish(validateClipOutput(event.data.output))
      } catch (error) {
        finish(undefined, error)
      }
    }
    try {
      worker.postMessage({ file, frameRate })
    } catch {
      finish(undefined, new ExtractionError('extraction-failed'))
    }
  })
}
