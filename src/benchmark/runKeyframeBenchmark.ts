import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import {
  keyframeTargets,
  KEYFRAME_QUALITY,
} from '../domain/services/videoPreviewPolicy'
import { extractKeyframesWithWorker } from '../infrastructure/video/extraction/previewWorkerClient'
import { KEYFRAME_READ_BYTES } from '../infrastructure/video/extraction/keyframeExtraction'
import {
  EXTRACTION_DEADLINE_MS,
  MAX_OUTPUT_BYTES,
  safeFailure,
  type ExtractionOutput,
  type FailureReason,
} from '../infrastructure/video/extraction/previewExtraction'
import { readPlayerDuration } from '../infrastructure/video/benchmark/domPreviewExtraction'

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
  wallMs: number
}
export type KeyframeReport = {
  schemaVersion: 1
  mode: 'keyframe-extraction-v1'
  status: 'completed' | 'failed' | 'interrupted'
  settings: {
    jobs: 1
    samplingPolicy: '15s-max100'
    maxWidth: KeyframeWidth
    quality: number
    readerMode: 'buffered-1mib'
    maxReadBytes: number
    maxOutputBytes: number
    deadlineMs: number
    candidate: 'mediabunny@1.55.7'
  }
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  rows: KeyframeRow[]
  wallMs: number
}

// The enclosing plan owns the benchmark lock and defers all sample display.
export async function runKeyframeBenchmark(options: {
  files: File[]
  selectionId: string
  build: BuildIdentity
  signal: AbortSignal
  maxWidth: KeyframeWidth
  sampleFile: number
  onProgress?: (message: string) => void
  onSample?: (sample: KeyframeSample) => void
}): Promise<KeyframeReport> {
  const started = performance.now()
  const report: KeyframeReport = {
    schemaVersion: 1,
    mode: 'keyframe-extraction-v1',
    status: 'completed',
    settings: {
      jobs: 1,
      samplingPolicy: '15s-max100',
      maxWidth: options.maxWidth,
      quality: KEYFRAME_QUALITY,
      readerMode: 'buffered-1mib',
      maxReadBytes: KEYFRAME_READ_BYTES,
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
        'Player metadata preparation included in wall time; fresh worker per file; shared browser, OS and storage caches; no app result cache',
    },
    rows: [],
    wallMs: 0,
  }
  let sample: KeyframeSample | undefined
  for (const [index, file] of options.files.entries()) {
    if (options.signal.aborted) break
    options.onProgress?.(
      `Video ${index + 1}/${options.files.length} · ${options.maxWidth}px keyframes`,
    )
    const jobStarted = performance.now()
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
      const duration = await readPlayerDuration(file, options.signal)
      row.expectedFrames = keyframeTargets(duration).length
      const output = await extractKeyframesWithWorker(
        file,
        duration,
        options.signal,
        options.maxWidth,
      )
      options.signal.throwIfAborted()
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
      row.reason = safeFailure(error)
      row.status = row.reason === 'aborted' ? 'aborted' : 'failed'
    }
    row.wallMs = performance.now() - jobStarted
    report.rows.push(row)
  }
  report.wallMs = performance.now() - started
  report.status = options.signal.aborted
    ? 'interrupted'
    : report.rows.some((row) => row.status !== 'passed')
      ? 'failed'
      : 'completed'
  if (sample && !options.signal.aborted) options.onSample?.(sample)
  return report
}
