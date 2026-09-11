import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  workerFailure,
} from './previewExtraction'
import {
  CLIP_FPS,
  CLIP_SECONDS,
  validateClipSeconds,
  type ClipSeconds,
  validateClipFrameRate,
  validateClipOutput,
  type ClipFrameRate,
  type ClipOutput,
} from './clipExtraction'
import { motionClipWindows } from '../../../domain/services/videoPreviewPolicy'
import { progressReceiver } from './workerDiagnostics'
import type {
  VideoPreviewDiagnostic,
  VideoPreviewProgress,
} from '@app/ports/IVideoPreviewGenerator'

export type MotionRequest = { kind: 'motion'; duration: number }

export function extractClipsWithWorker(
  file: File,
  signal: AbortSignal,
  frameRate: ClipFrameRate = CLIP_FPS,
  clipSeconds: ClipSeconds = CLIP_SECONDS,
  motion?: MotionRequest,
  onProgress?: (progress: VideoPreviewProgress) => void,
): Promise<ClipOutput> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'))
      return
    }
    validateClipFrameRate(frameRate)
    validateClipSeconds(clipSeconds)
    if (motion && !motionClipWindows(motion.duration).length)
      throw new ExtractionError('invalid-metadata')
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
    let lastDiagnostics: VideoPreviewDiagnostic = {}
    const receiveProgress = progressReceiver(
      motion ? motionClipWindows(motion.duration).length : 0,
      (progress) => {
        lastDiagnostics = progress.diagnostics
        onProgress?.(progress)
      },
    )
    const finish = (output?: ClipOutput, error?: unknown) => {
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
        const output = validateClipOutput(event.data.output, clipSeconds)
        if (motion) {
          const windows = motionClipWindows(motion.duration)
          if (
            output.clips.length !== windows.length ||
            output.clips.some(
              (clip, i) =>
                Math.abs(clip.start - windows[i].start) > 1e-6 ||
                clip.duration > windows[i].end - windows[i].start + 1e-6,
            )
          )
            throw new ExtractionError('output-invalid')
        }
        finish(output)
      } catch (error) {
        finish(undefined, error)
      }
    }
    try {
      worker.postMessage({
        file,
        frameRate,
        clipSeconds,
        ...motion,
        ...(onProgress ? { progress: true } : {}),
      })
    } catch {
      finish(undefined, new ExtractionError('extraction-failed'))
    }
  })
}
