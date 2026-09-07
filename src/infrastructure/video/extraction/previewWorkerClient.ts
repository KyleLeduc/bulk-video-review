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
import { keyframeTargets } from '../../../domain/services/videoPreviewPolicy'
import { progressReceiver } from './workerDiagnostics'
import type {
  VideoPreviewDiagnostic,
  VideoPreviewProgress,
} from '@app/ports/IVideoPreviewGenerator'
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
  onProgress?: (progress: VideoPreviewProgress) => void,
): Promise<ExtractionOutput> {
  return runPreviewWorker(
    file,
    signal,
    {
      kind: 'keyframes',
      duration,
      maxWidth,
    },
    onProgress,
  )
}

function runPreviewWorker(
  file: File,
  signal: AbortSignal,
  request:
    | KeyframeRequest
    | { prepared: PreparedExtraction; readerMode: FileReaderMode },
  onProgress?: (progress: VideoPreviewProgress) => void,
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
    let lastDiagnostics: VideoPreviewDiagnostic = {}
    const receiveProgress = progressReceiver(
      'kind' in request
        ? keyframeTargets(request.duration).length
        : request.prepared.targets.length,
      (progress) => {
        lastDiagnostics = progress.diagnostics
        onProgress?.(progress)
      },
    )
    const finish = (output?: ExtractionOutput, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      if (output) resolve(output)
      else
        reject(
          error instanceof ExtractionError
            ? new ExtractionError(error.reason, {
                ...lastDiagnostics,
                ...error.diagnostics,
              })
            : error,
        )
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
      if (settled) return
      try {
        if (event.data?.type === 'progress') {
          receiveProgress(event.data)
          return
        }
        if (event.data?.ok !== true)
          throw workerFailure(event.data?.reason, event.data?.diagnostics)
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
      worker.postMessage({
        file,
        ...request,
        ...(onProgress ? { progress: true } : {}),
      })
    } catch {
      finish(undefined, new ExtractionError('extraction-failed'))
    }
  })
}
