import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  validateExtraction,
  workerFailure,
  type PreparedExtraction,
  type ExtractionOutput,
} from './previewExtraction'

export function extractWithWorker(
  file: File,
  prepared: PreparedExtraction,
  signal: AbortSignal,
): Promise<ExtractionOutput> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'))
      return
    }
    let worker: Worker
    try {
      worker = new Worker(
        new URL('./previewExtraction.worker.ts', import.meta.url),
        { type: 'module' },
      )
    } catch {
      reject(new ExtractionError('unsupported'))
      return
    }
    let settled = false
    const finish = (output?: ExtractionOutput, error?: unknown) => {
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
        const output = validateExtraction(event.data.output, prepared)
        if (
          output.readBytes === null ||
          output.readCalls === null ||
          output.readCalls <= 0 ||
          output.readBytes < output.readCalls
        )
          throw new ExtractionError('output-invalid')
        finish(output)
      } catch (error) {
        finish(undefined, error)
      }
    }
    try {
      worker.postMessage({ file, prepared })
    } catch {
      finish(undefined, new ExtractionError('extraction-failed'))
    }
  })
}
