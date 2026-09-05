import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  safeFailure,
  validateExtraction,
  type ExtractionOutput,
  type FailureReason,
  type PreparedExtraction,
} from '../infrastructure/video/benchmark/previewExtraction'
import { extractWithWorker } from '../infrastructure/video/benchmark/previewWorkerClient'
import {
  extractWithDom,
  prepareFile,
} from '../infrastructure/video/benchmark/domPreviewExtraction'

export type ExtractionBackend = 'dom' | 'mediabunny'
export type ExtractionRow = {
  file: number
  repetition: number
  order: number
  backend: ExtractionBackend
  status: 'passed' | 'failed' | 'aborted'
  reason: FailureReason | null
  wallMs: number
  frames: number
  outputBytes: number
  readBytes: number | null
  readCalls: number | null
}
export type ExtractionReport = {
  errors: 'display-failed'[]
  schemaVersion: 1
  mode: 'preview-extraction-custom-v1'
  status: 'completed' | 'failed' | 'interrupted'
  hidden: boolean
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  settings: {
    repetitions: number
    jobs: 1
    candidate: 'mediabunny@1.55.7'
    deadlineMs: number
  }
  preparation: { file: number; wallMs: number; reason: FailureReason | null }[]
  rows: ExtractionRow[]
}
type Options = {
  files: File[]
  selectionId: string
  repetitions: number
  build: BuildIdentity
  signal: AbortSignal
  onProgress?: (message: string) => void
  onRow?: (row: ExtractionRow, output?: ExtractionOutput) => void
}

// Deadlines bound waiting and request cancellation; they do not bound memory.
async function timedJob<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let expired = false
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timer = setTimeout(() => {
    expired = true
    abort()
  }, EXTRACTION_DEADLINE_MS)
  try {
    controller.signal.throwIfAborted()
    const output = await run(controller.signal)
    controller.signal.throwIfAborted()
    return output
  } catch (error) {
    if (expired) throw new ExtractionError('deadline')
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export async function runExtractionBenchmark(
  options: Options,
): Promise<ExtractionReport> {
  if (
    !Number.isInteger(options.repetitions) ||
    options.repetitions < 1 ||
    options.repetitions > 5 ||
    !options.files.length
  )
    throw new Error('Choose files and 1–5 repetitions')
  if (!navigator.locks) throw new Error('Web Locks unavailable')
  return navigator.locks.request(
    'bvr-video-benchmark-v1',
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error('Another benchmark is active in this browser')
      const controller = new AbortController()
      let hidden = document.hidden
      const abort = () => controller.abort()
      const visibility = () => {
        if (document.hidden) {
          hidden = true
          abort()
        }
      }
      options.signal.addEventListener('abort', abort, { once: true })
      document.addEventListener('visibilitychange', visibility)
      if (options.signal.aborted || hidden) abort()
      const report: ExtractionReport = {
        errors: [],
        schemaVersion: 1,
        mode: 'preview-extraction-custom-v1',
        status: 'completed',
        hidden,
        selection: {
          id: options.selectionId,
          sizes: options.files.map((file) => file.size),
          verification: 'selection-only',
        },
        identity: {
          build: options.build,
          userAgent: navigator.userAgent,
          cacheScope:
            'DOM metadata preparation outside timing; fresh media element/worker per job; shared browser and OS caches; no app result cache',
        },
        settings: {
          repetitions: options.repetitions,
          jobs: 1,
          candidate: 'mediabunny@1.55.7',
          deadlineMs: EXTRACTION_DEADLINE_MS,
        },
        preparation: [],
        rows: [],
      }
      const notify = (callback: () => void) => {
        try {
          callback()
        } catch {
          if (!report.errors.includes('display-failed'))
            report.errors.push('display-failed')
        }
      }
      try {
        const prepared: (PreparedExtraction | undefined)[] = []
        for (
          let file = 0;
          file < options.files.length && !controller.signal.aborted;
          file++
        ) {
          notify(() =>
            options.onProgress?.(
              `Preparing video ${file + 1}/${options.files.length}`,
            ),
          )
          const started = performance.now()
          let reason: FailureReason | null = null
          try {
            prepared[file] = await timedJob(controller.signal, (signal) =>
              prepareFile(options.files[file], signal),
            )
          } catch (error) {
            reason = safeFailure(error)
          }
          report.preparation.push({
            file: file + 1,
            wallMs: performance.now() - started,
            reason,
          })
        }
        for (
          let repetition = 1;
          repetition <= options.repetitions && !controller.signal.aborted;
          repetition++
        ) {
          const backends: ExtractionBackend[] =
            repetition % 2 ? ['dom', 'mediabunny'] : ['mediabunny', 'dom']
          for (
            let file = 0;
            file < options.files.length && !controller.signal.aborted;
            file++
          ) {
            for (const backend of backends) {
              if (controller.signal.aborted) break
              const row: ExtractionRow = {
                file: file + 1,
                repetition,
                order: report.rows.length + 1,
                backend,
                status: 'failed',
                reason: null,
                wallMs: 0,
                frames: 0,
                outputBytes: 0,
                readBytes: null,
                readCalls: null,
              }
              notify(() =>
                options.onProgress?.(
                  `Repeat ${repetition}/${options.repetitions} · video ${file + 1}/${options.files.length} · ${backend}`,
                ),
              )
              const started = performance.now()
              let output: ExtractionOutput | undefined
              try {
                const targets = prepared[file]
                if (!targets) throw new ExtractionError('invalid-metadata')
                output = await timedJob(controller.signal, (signal) =>
                  (backend === 'dom' ? extractWithDom : extractWithWorker)(
                    options.files[file],
                    targets,
                    signal,
                  ),
                )
                row.wallMs = performance.now() - started
                validateExtraction(output, targets)
                row.status = 'passed'
                row.frames = output.frames.length
                row.outputBytes = output.frames.reduce(
                  (n, frame) => n + frame.size,
                  0,
                )
                row.readBytes = output.readBytes
                row.readCalls = output.readCalls
              } catch (error) {
                row.wallMs = performance.now() - started
                row.reason = safeFailure(error)
                row.status = row.reason === 'aborted' ? 'aborted' : 'failed'
                output = undefined
              }
              report.rows.push(row)
              notify(() => options.onRow?.(row, output))
            }
          }
        }
        report.hidden = hidden
        report.status = controller.signal.aborted
          ? 'interrupted'
          : report.errors.length > 0 ||
              report.rows.some((row) => row.status !== 'passed') ||
              report.preparation.some((row) => row.reason)
            ? 'failed'
            : 'completed'
        return report
      } finally {
        options.signal.removeEventListener('abort', abort)
        document.removeEventListener('visibilitychange', visibility)
      }
    },
  )
}
