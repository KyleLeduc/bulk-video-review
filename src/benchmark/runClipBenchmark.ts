import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import {
  CLIP_FPS,
  CLIP_READ_BYTES,
  CLIP_SECONDS,
  MAX_CLIP_BYTES,
  type ClipOutput,
} from '../infrastructure/video/benchmark/clipExtraction'
import { extractClipsWithWorker } from '../infrastructure/video/benchmark/clipWorkerClient'
import {
  EXTRACTION_DEADLINE_MS,
  MAX_OUTPUT_BYTES,
  safeFailure,
  type FailureReason,
} from '../infrastructure/video/benchmark/previewExtraction'

export type ClipRow = {
  file: number
  status: 'passed' | 'failed' | 'aborted'
  reason: FailureReason | null
  wallMs: number
  clips: number
  outputBytes: number
  readBytes: number | null
  readCalls: number | null
  codec: ClipOutput['codec'] | null
  metrics: ClipOutput['metrics'] | null
}
export type ClipReport = {
  schemaVersion: 1
  mode: 'clip-extraction-custom-v1'
  status: 'completed' | 'failed' | 'interrupted'
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  settings: {
    jobs: 1
    clipSeconds: 3
    maxClips: 10
    frameRate: 10
    maxDimension: 320
    bitrate: 250000
    muted: true
    readerMode: 'buffered-1mib'
    maxReadBytes: number
    maxOutputBytes: number
    maxClipBytes: number
    deadlineMs: number
    candidate: 'mediabunny@1.55.7'
  }
  rows: ClipRow[]
  wallMs: number
}
export type ClipSample = { file: number; output: ClipOutput }

// Called only inside the plan runner's browser-wide lock and visibility lifetime.
export async function runClipBenchmark(options: {
  files: File[]
  selectionId: string
  build: BuildIdentity
  signal: AbortSignal
  onProgress?: (message: string) => void
  onSample?: (sample: ClipSample) => void
}): Promise<ClipReport> {
  const started = performance.now()
  const report: ClipReport = {
    schemaVersion: 1,
    mode: 'clip-extraction-custom-v1',
    status: 'completed',
    selection: {
      id: options.selectionId,
      sizes: options.files.map((f) => f.size),
      verification: 'selection-only',
    },
    identity: {
      build: options.build,
      userAgent: navigator.userAgent,
      cacheScope:
        'Fresh worker per file; metadata setup included in timing; shared browser, OS and storage caches; no app result cache',
    },
    settings: {
      jobs: 1,
      clipSeconds: CLIP_SECONDS,
      maxClips: 10,
      frameRate: CLIP_FPS,
      maxDimension: 320,
      bitrate: 250000,
      muted: true,
      readerMode: 'buffered-1mib',
      maxReadBytes: CLIP_READ_BYTES,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      maxClipBytes: MAX_CLIP_BYTES,
      deadlineMs: EXTRACTION_DEADLINE_MS,
      candidate: 'mediabunny@1.55.7',
    },
    rows: [],
    wallMs: 0,
  }
  let sample: ClipSample | undefined
  for (
    let file = 0;
    file < options.files.length && !options.signal.aborted;
    file++
  ) {
    options.onProgress?.(
      `Video ${file + 1}/${options.files.length} · three-second clips`,
    )
    const row: ClipRow = {
      file: file + 1,
      status: 'failed',
      reason: null,
      wallMs: 0,
      clips: 0,
      outputBytes: 0,
      readBytes: null,
      readCalls: null,
      codec: null,
      metrics: null,
    }
    const jobStarted = performance.now()
    try {
      const output = await extractClipsWithWorker(
        options.files[file],
        options.signal,
      )
      options.signal.throwIfAborted()
      Object.assign(row, {
        status: 'passed',
        clips: output.clips.length,
        outputBytes: output.clips.reduce((n, c) => n + c.blob.size, 0),
        readBytes: output.readBytes,
        readCalls: output.readCalls,
        codec: output.codec,
        metrics: output.metrics,
      })
      sample = { file: file + 1, output }
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
