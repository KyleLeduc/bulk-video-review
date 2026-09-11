import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import type { VideoPreviewDiagnostic } from '../application/ports/IVideoPreviewGenerator'
import { safeDiagnostics } from '../infrastructure/video/extraction/workerDiagnostics'
import {
  keyframeTargets,
  KEYFRAME_QUALITY,
} from '../domain/services/videoPreviewPolicy'
import { extractKeyframesWithWorker } from '../infrastructure/video/extraction/previewWorkerClient'
import { KEYFRAME_READ_BYTES } from '../infrastructure/video/extraction/keyframeExtraction'
import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  safeFailure,
  type ExtractionOutput,
  type FailureReason,
} from '../infrastructure/video/extraction/previewExtraction'
import {
  extractKeyframesWithDom,
  readPlayerDuration,
} from '../infrastructure/video/benchmark/domPreviewExtraction'

export type KeyframeWidth = 120 | 160 | 240
export type KeyframeSample = {
  file: number
  duration: number
  output: ExtractionOutput
}
export type KeyframeRow = {
  file: number
  status: 'passed' | 'failed' | 'aborted'
  reason: FailureReason | null
  expectedFrames: number | null
  frames: number
  outputBytes: number
  width: number | null
  height: number | null
  readBytes: number | null
  readCalls: number | null
  metrics: ExtractionOutput['metrics'] | null
  diagnostics?: VideoPreviewDiagnostic
  wallMs: number
}
export type KeyframeReport = {
  schemaVersion: 1
  mode: 'keyframe-extraction-v1'
  status: 'completed' | 'failed' | 'interrupted'
  settings: {
    jobs: 1 | 2
    execution: 'dom' | 'mediabunny'
    samplingPolicy: '15s-max100'
    maxWidth: KeyframeWidth
    quality: number
    readerMode: 'buffered-1mib' | null
    maxReadBytes: number | null
    maxOutputBytes: number
    deadlineMs: number
    candidate: 'mediabunny@1.55.7'
  }
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  rows: KeyframeRow[]
  peakActiveJobs: number
  wallMs: number
}

// The enclosing plan owns the benchmark lock and defers all sample display.
export async function runKeyframeBenchmark(options: {
  files: File[]
  selectionId: string
  build: BuildIdentity
  signal: AbortSignal
  maxWidth: KeyframeWidth
  execution?: 'dom' | 'mediabunny'
  jobs?: 1 | 2
  sampleFile?: number
  onProgress?: (message: string) => void
  onSample?: (sample: KeyframeSample) => void
}): Promise<KeyframeReport> {
  const started = performance.now()
  const execution = options.execution ?? 'mediabunny'
  const jobs = options.jobs ?? 1
  const report: KeyframeReport = {
    schemaVersion: 1,
    mode: 'keyframe-extraction-v1',
    status: 'completed',
    settings: {
      jobs,
      execution,
      samplingPolicy: '15s-max100',
      maxWidth: options.maxWidth,
      quality: KEYFRAME_QUALITY,
      readerMode: execution === 'dom' ? null : 'buffered-1mib',
      maxReadBytes: execution === 'dom' ? null : KEYFRAME_READ_BYTES,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      deadlineMs: EXTRACTION_DEADLINE_MS,
      candidate: 'mediabunny@1.55.7',
    },
    selection: {
      id: options.selectionId,
      sizes: options.files.map((file) => file.size),
      verification: 'selection-only',
    },
    identity: {
      build: options.build,
      userAgent: navigator.userAgent,
      cacheScope:
        'Player metadata preparation included in wall time; fresh media element/worker per file; shared browser, OS and storage caches; no app result cache',
    },
    rows: [],
    peakActiveJobs: 0,
    wallMs: 0,
  }
  let sample: KeyframeSample | undefined
  let nextIndex = 0
  let activeJobs = 0
  const runFile = async (index: number) => {
    const file = options.files[index]
    options.onProgress?.(
      `Video ${index + 1}/${options.files.length} · ${execution} · ${options.maxWidth}px seeks`,
    )
    const jobStarted = performance.now()
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal.addEventListener('abort', abort, { once: true })
    if (options.signal.aborted) abort()
    let expired = false
    const deadline = setTimeout(() => {
      expired = true
      controller.abort()
    }, EXTRACTION_DEADLINE_MS)
    activeJobs++
    report.peakActiveJobs = Math.max(report.peakActiveJobs, activeJobs)
    const row: KeyframeRow = {
      file: index + 1,
      status: 'failed',
      reason: null,
      expectedFrames: null,
      frames: 0,
      outputBytes: 0,
      width: null,
      height: null,
      readBytes: null,
      readCalls: null,
      metrics: null,
      wallMs: 0,
    }
    try {
      controller.signal.throwIfAborted()
      const duration = await readPlayerDuration(file, controller.signal)
      controller.signal.throwIfAborted()
      row.expectedFrames = keyframeTargets(duration).length
      const extract =
        execution === 'dom'
          ? extractKeyframesWithDom
          : extractKeyframesWithWorker
      const output = await extract(
        file,
        duration,
        controller.signal,
        options.maxWidth,
      )
      controller.signal.throwIfAborted()
      Object.assign(row, {
        status: 'passed',
        frames: output.frames.length,
        outputBytes: output.frames.reduce((sum, blob) => sum + blob.size, 0),
        width: output.width,
        height: output.height,
        readBytes: output.readBytes,
        readCalls: output.readCalls,
        metrics: output.metrics,
      })
      if (row.file === options.sampleFile)
        sample = { file: row.file, duration, output }
    } catch (error) {
      if (error instanceof ExtractionError)
        row.diagnostics = safeDiagnostics(error.diagnostics)
      row.reason = options.signal.aborted
        ? 'aborted'
        : expired
          ? 'deadline'
          : safeFailure(error)
      row.status = row.reason === 'aborted' ? 'aborted' : 'failed'
    } finally {
      clearTimeout(deadline)
      options.signal.removeEventListener('abort', abort)
      activeJobs--
      row.wallMs = performance.now() - jobStarted
      report.rows.push(row)
    }
  }
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (!options.signal.aborted && nextIndex < options.files.length) {
        const index = nextIndex++
        await runFile(index)
      }
    }),
  )
  report.rows.sort((a, b) => a.file - b.file)
  report.wallMs = performance.now() - started
  report.status = options.signal.aborted
    ? 'interrupted'
    : report.rows.some((row) => row.status !== 'passed')
      ? 'failed'
      : 'completed'
  if (sample && !options.signal.aborted) options.onSample?.(sample)
  return report
}
