import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  validateExtraction,
  validateMetrics,
  workerFailure,
  type PreparedExtraction,
  type ExtractionOutput,
} from './previewExtraction'
import type { FileReaderMode } from './fileReader'
import {
  validateKeyframeOutput,
  type KeyframeRequest,
} from './keyframeExtraction'

export function extractWithWorker(
  file: File,
  prepared: PreparedExtraction,
  signal: AbortSignal,
  readerMode: FileReaderMode = 'direct',
): Promise<ExtractionOutput> {
  return runPreviewWorker(file, signal, { prepared, readerMode })
}

export function extractKeyframesWithWorker(
  file: File,
  duration: number,
  signal: AbortSignal,
  maxWidth = 160,
): Promise<ExtractionOutput> {
  return runPreviewWorker(file, signal, {
    kind: 'keyframes',
    duration,
    maxWidth,
  })
}

function runPreviewWorker(
  file: File,
  signal: AbortSignal,
  request:
    | KeyframeRequest
    | { prepared: PreparedExtraction; readerMode: FileReaderMode },
): Promise<ExtractionOutput> {
  const started = performance.now()
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
        const output =
          'kind' in request
            ? validateKeyframeOutput(
                event.data.output,
                request.duration,
                request.maxWidth,
              )
            : validateExtraction(event.data.output, request.prepared)
        output.metrics = validateMetrics(output.metrics)
        output.metrics.workerOverheadMs = Math.max(
          0,
          performance.now() - started - output.metrics.totalMs,
        )
        if (
          output.readBytes === null ||
          output.readCalls === null ||
          output.readCalls <= 0 ||
          output.readBytes < output.readCalls ||
          output.metrics.readMs === null ||
          output.metrics.readMaxMs === null
        )
          throw new ExtractionError('output-invalid')
        finish(output)
      } catch (error) {
        finish(undefined, error)
      }
    }
    try {
      worker.postMessage({ file, ...request })
    } catch {
      finish(undefined, new ExtractionError('extraction-failed'))
    }
  })
}
