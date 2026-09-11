import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import type { VideoPreviewDiagnostic } from '../application/ports/IVideoPreviewGenerator'
import { safeDiagnostics } from '../infrastructure/video/extraction/workerDiagnostics'
import { readPlayerDuration } from '../infrastructure/video/benchmark/domPreviewExtraction'
import {
  CLIP_FPS,
  CLIP_READ_BYTES,
  CLIP_SECONDS,
  MAX_CLIP_BYTES,
  type ClipOutput,
  type ClipFrameRate,
  type ClipSeconds,
  validateClipSeconds,
  validateClipFrameRate,
} from '../infrastructure/video/extraction/clipExtraction'
import { extractClipsWithWorker } from '../infrastructure/video/extraction/clipWorkerClient'
import {
  EXTRACTION_DEADLINE_MS,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  safeFailure,
  type FailureReason,
} from '../infrastructure/video/extraction/previewExtraction'

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
  diagnostics?: VideoPreviewDiagnostic
}
export type ClipReport = {
  schemaVersion: 1
  mode: 'clip-extraction-custom-v1'
  status: 'completed' | 'failed' | 'interrupted'
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  settings: {
    jobs: 1
    clipSeconds: ClipSeconds
    maxClips: 10
    frameRate: ClipFrameRate
    maxDimension: 320
    bitrate: 250000
    muted: true
    readerMode: 'buffered-1mib'
    maxReadBytes: number
    maxOutputBytes: number
    maxClipBytes: number
    deadlineMs: number
    candidate: 'mediabunny@1.55.7'
    samplingPolicy?: 'production-overview-v1'
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
  frameRate?: ClipFrameRate
  clipSeconds?: ClipSeconds
  production?: true
  sampleFile?: number
  onProgress?: (message: string) => void
  onSample?: (sample: ClipSample) => void
}): Promise<ClipReport> {
  const frameRate = validateClipFrameRate(options.frameRate ?? CLIP_FPS)
  const clipSeconds = validateClipSeconds(options.clipSeconds ?? CLIP_SECONDS)
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
      clipSeconds,
      maxClips: 10,
      frameRate,
      maxDimension: 320,
      bitrate: 250000,
      muted: true,
      readerMode: 'buffered-1mib',
      maxReadBytes: CLIP_READ_BYTES,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      maxClipBytes: MAX_CLIP_BYTES,
      deadlineMs: EXTRACTION_DEADLINE_MS,
      candidate: 'mediabunny@1.55.7',
      ...(options.production
        ? { samplingPolicy: 'production-overview-v1' as const }
        : {}),
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
      `Video ${file + 1}/${options.files.length} · ${clipSeconds}-second clips · ${frameRate} FPS`,
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
      const motion = options.production
        ? {
            kind: 'motion' as const,
            duration: await readPlayerDuration(
              options.files[file],
              options.signal,
            ),
          }
        : undefined
      const output = await extractClipsWithWorker(
        options.files[file],
        options.signal,
        frameRate,
        clipSeconds,
        motion,
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
      if (options.sampleFile === undefined || options.sampleFile === file + 1)
        sample = { file: file + 1, output }
    } catch (error) {
      row.reason = safeFailure(error)
      if (error instanceof ExtractionError)
        row.diagnostics = safeDiagnostics(error.diagnostics)
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
