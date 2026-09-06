import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import {
  EXTRACTION_DEADLINE_MS,
  MAX_OUTPUT_BYTES,
  checkPreviewCount,
  readBudgetForCount,
  type PreviewCount,
  ExtractionError,
  safeFailure,
  validateExtraction,
  validateMetrics,
  type ExtractionMetrics,
  type ExtractionOutput,
  type FailureReason,
  type PreparedExtraction,
} from '../infrastructure/video/benchmark/previewExtraction'
import { extractWithWorker } from '../infrastructure/video/benchmark/previewWorkerClient'
import type { BenchmarkReaderMode } from '../infrastructure/video/benchmark/benchmarkFileReader'
import {
  planSteps,
  type ClipPlanStep,
  type ExtractionPreset,
  type PlanStep,
} from './extractionPlans'
import {
  runClipBenchmark,
  type ClipReport,
  type ClipSample,
} from './runClipBenchmark'
import {
  extractWithDom,
  prepareFile,
} from '../infrastructure/video/benchmark/domPreviewExtraction'

export type ExtractionBackend = 'dom' | 'mediabunny'
export type ExtractionExecution = 'paired' | ExtractionBackend
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
  startedAtMs: number
  finishedAtMs: number
  metrics: ExtractionMetrics | null
}
export type ExtractionSample = { row: ExtractionRow; output: ExtractionOutput }
export type ExtractionBatch = {
  repetition: number
  backend: ExtractionBackend
  wallMs: number
  peakActiveJobs: number
  completed: number
  failed: number
  aborted: number
}
export type ExtractionReport = {
  errors: 'display-failed'[]
  schemaVersion: 4
  mode: 'preview-extraction-custom-v1'
  status: 'completed' | 'failed' | 'interrupted'
  hidden: boolean
  selection: { id: string; sizes: number[]; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  settings: {
    repetitions: number
    jobs: 1 | 2 | 4
    previewCount: PreviewCount
    samplingPolicy: 'integer-deciles' | 'fractional-even'
    maxReadBytes: number | null
    maxOutputBytes: number
    execution: ExtractionExecution
    samples: 'after-run'
    readerMode: BenchmarkReaderMode | null
    candidate: 'mediabunny@1.55.7'
    deadlineMs: number
  }
  preparation: { file: number; wallMs: number; reason: FailureReason | null }[]
  rows: ExtractionRow[]
  batches: ExtractionBatch[]
}
type Options = {
  files: File[]
  selectionId: string
  repetitions: number
  execution?: ExtractionExecution
  jobs?: 1 | 2 | 4
  previewCount?: PreviewCount
  readerMode?: BenchmarkReaderMode
  build: BuildIdentity
  signal: AbortSignal
  onProgress?: (message: string) => void
  onRow?: (row: ExtractionRow) => void
  onSamples?: (samples: ExtractionSample[]) => void
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
  if (!navigator.locks) throw new Error('Web Locks unavailable')
  return navigator.locks.request(
    'bvr-video-benchmark-v1',
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error('Another benchmark is active in this browser')
      return runExtractionUnlocked(options)
    },
  )
}

async function runExtractionUnlocked(
  options: Options,
): Promise<ExtractionReport> {
  const execution = options.execution ?? 'paired'
  const jobs = options.jobs ?? 1
  const readerMode = options.readerMode ?? 'direct'
  const previewCount = options.previewCount ?? 9
  checkPreviewCount(previewCount)
  if (
    !Number.isInteger(options.repetitions) ||
    options.repetitions < 1 ||
    options.repetitions > 5 ||
    !options.files.length ||
    !['paired', 'dom', 'mediabunny'].includes(execution) ||
    ![1, 2, 4].includes(jobs) ||
    !['direct', 'buffered-1mib'].includes(readerMode) ||
    (execution === 'paired' && jobs !== 1)
  )
    throw new Error(
      'Choose files, a supported reader, 1–5 repetitions and 1, 2 or 4 jobs; paired comparisons require one job',
    )
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
    schemaVersion: 4,
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
      jobs,
      previewCount,
      samplingPolicy:
        previewCount === 9 ? 'integer-deciles' : 'fractional-even',
      maxReadBytes:
        execution === 'dom' ? null : readBudgetForCount(previewCount),
      maxOutputBytes: MAX_OUTPUT_BYTES,
      execution,
      samples: 'after-run',
      readerMode: execution === 'dom' ? null : readerMode,
      candidate: 'mediabunny@1.55.7',
      deadlineMs: EXTRACTION_DEADLINE_MS,
    },
    preparation: [],
    rows: [],
    batches: [],
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
    const runStarted = performance.now()
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
          prepareFile(options.files[file], signal, previewCount),
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
    let nextOrder = 0
    let sampleKey = -1
    let samples: ExtractionSample[] = []
    const runFile = async (
      file: number,
      repetition: number,
      backend: ExtractionBackend,
    ) => {
      const row: ExtractionRow = {
        file: file + 1,
        repetition,
        order: ++nextOrder,
        backend,
        status: 'failed',
        reason: null,
        wallMs: 0,
        frames: 0,
        outputBytes: 0,
        readBytes: null,
        readCalls: null,
        startedAtMs: 0,
        finishedAtMs: 0,
        metrics: null,
      }
      notify(() =>
        options.onProgress?.(
          `Repeat ${repetition}/${options.repetitions} · video ${file + 1}/${options.files.length} · ${backend}`,
        ),
      )
      const started = performance.now()
      row.startedAtMs = started - runStarted
      let output: ExtractionOutput | undefined
      try {
        const targets = prepared[file]
        if (!targets) throw new ExtractionError('invalid-metadata')
        output = await timedJob(controller.signal, (signal) =>
          backend === 'dom'
            ? extractWithDom(options.files[file], targets, signal)
            : extractWithWorker(
                options.files[file],
                targets,
                signal,
                readerMode,
              ),
        )
        validateExtraction(output, targets)
        const metrics = validateMetrics(output.metrics)
        // DOM cannot provide reader or worker evidence; never export invented counters.
        if (
          backend === 'dom' &&
          [
            output.readBytes,
            output.readCalls,
            metrics.readMs,
            metrics.readMaxMs,
            metrics.workerOverheadMs,
          ].some((value) => value !== null)
        )
          throw new ExtractionError('output-invalid')
        row.metrics = metrics
        row.status = 'passed'
        row.frames = output.frames.length
        row.outputBytes = output.frames.reduce((n, frame) => n + frame.size, 0)
        row.readBytes = output.readBytes
        row.readCalls = output.readCalls
      } catch (error) {
        row.reason = safeFailure(error)
        row.status = row.reason === 'aborted' ? 'aborted' : 'failed'
        output = undefined
      }
      const finished = performance.now()
      row.finishedAtMs = finished - runStarted
      row.wallMs = finished - started
      report.rows.push(row)
      // Keep only the greatest file/repetition key, independent of completion order.
      const key = repetition * options.files.length + file
      if (key > sampleKey) {
        samples = []
        sampleKey = key
      }
      if (key === sampleKey && output) samples.push({ row, output })
      notify(() => options.onRow?.(row))
    }
    for (
      let repetition = 1;
      repetition <= options.repetitions && !controller.signal.aborted;
      repetition++
    ) {
      if (execution === 'paired') {
        const backends: ExtractionBackend[] =
          repetition % 2 ? ['dom', 'mediabunny'] : ['mediabunny', 'dom']
        for (
          let file = 0;
          file < options.files.length && !controller.signal.aborted;
          file++
        ) {
          for (const backend of backends) {
            if (controller.signal.aborted) break
            await runFile(file, repetition, backend)
          }
        }
      } else {
        const batchStarted = performance.now()
        let nextFile = 0
        let activeJobs = 0
        let peakActiveJobs = 0
        const consume = async () => {
          while (
            nextFile < options.files.length &&
            !controller.signal.aborted
          ) {
            const file = nextFile++
            activeJobs++
            peakActiveJobs = Math.max(peakActiveJobs, activeJobs)
            try {
              await runFile(file, repetition, execution)
            } finally {
              activeJobs--
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(jobs, options.files.length) }, consume),
        )
        const wallMs = performance.now() - batchStarted
        const batchRows = report.rows.filter(
          (row) => row.repetition === repetition,
        )
        report.batches.push({
          repetition,
          backend: execution,
          wallMs,
          peakActiveJobs,
          completed: batchRows.filter((row) => row.status === 'passed').length,
          failed: batchRows.filter((row) => row.status === 'failed').length,
          aborted: batchRows.filter((row) => row.status === 'aborted').length,
        })
      }
    }
    report.rows.sort((a, b) => a.order - b.order)
    // No sample image decoding while measured extraction is active.
    if (!controller.signal.aborted) notify(() => options.onSamples?.(samples))
    samples = []
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
}

export type PlanResult = {
  step: PlanStep
  report: ExtractionReport | ClipReport
}
export type ExtractionPlanReport = {
  schemaVersion: 1
  mode: 'extraction-plan-v1'
  preset: ExtractionPreset
  status: 'completed' | 'failed' | 'interrupted'
  hidden: boolean
  errors: ('display-failed' | 'step-failed')[]
  plannedSteps: PlanStep[]
  results: PlanResult[]
  wallMs: number
  selection: ExtractionReport['selection']
  identity: ExtractionReport['identity']
}
type PlanOptions = Pick<
  Options,
  'files' | 'selectionId' | 'build' | 'signal' | 'onProgress' | 'onSamples'
> & {
  preset: ExtractionPreset
  onStep?: (result: PlanResult, index: number) => void
  onClipSample?: (sample: ClipSample, step: ClipPlanStep) => void
}

export async function runExtractionPlan(
  options: PlanOptions,
): Promise<ExtractionPlanReport> {
  const steps = planSteps(options.preset)
  if (!options.files.length) throw new Error('Choose files')
  if (!navigator.locks) throw new Error('Web Locks unavailable')
  // Hold the SAME lock as manual/pipeline benchmarks across every step and gap.
  return navigator.locks.request(
    'bvr-video-benchmark-v1',
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error('Another benchmark is active in this browser')
      const started = performance.now()
      const controller = new AbortController()
      const report: ExtractionPlanReport = {
        schemaVersion: 1,
        mode: 'extraction-plan-v1',
        preset: options.preset,
        status: 'completed',
        hidden: document.hidden,
        errors: [],
        plannedSteps: steps,
        results: [],
        wallMs: 0,
        selection: {
          id: options.selectionId,
          sizes: options.files.map((file) => file.size),
          verification: 'selection-only',
        },
        identity: {
          build: options.build,
          userAgent: navigator.userAgent,
          cacheScope:
            'Preset order recorded in plannedSteps; configurations sequential; shared browser, OS and storage caches, not cold-cache trials; no app result cache',
        },
      }
      const abort = () => controller.abort()
      const visibility = () => {
        if (document.hidden) {
          report.hidden = true
          abort()
        }
      }
      options.signal.addEventListener('abort', abort, { once: true })
      document.addEventListener('visibilitychange', visibility)
      if (options.signal.aborted || report.hidden) abort()
      const notify = (callback: () => void) => {
        try {
          callback()
        } catch {
          if (!report.errors.includes('display-failed'))
            report.errors.push('display-failed')
        }
      }
      let samples: ExtractionSample[] = []
      // Quality plans retain at most four variants, each already bounded to
      // 16 MiB encoded output. Samples never enter the exported report.
      const clipSamples: { sample: ClipSample; step: ClipPlanStep }[] = []
      try {
        for (const [index, step] of steps.entries()) {
          if (controller.signal.aborted) break
          samples = []
          const onProgress = (message: string) =>
            notify(() =>
              options.onProgress?.(
                `Configuration ${index + 1}/${steps.length} · ${step.id} · pass ${step.pass} · ${message}`,
              ),
            )
          const common = {
            files: options.files,
            selectionId: options.selectionId,
            build: options.build,
            signal: controller.signal,
            onProgress,
          }
          try {
            const result =
              step.workload === 'stills'
                ? await runExtractionUnlocked({
                    ...common,
                    ...step,
                    repetitions: 1,
                    readerMode: 'buffered-1mib',
                    onSamples: (value) => {
                      samples = value
                    },
                  })
                : await runClipBenchmark({
                    ...common,
                    frameRate: step.frameRate,
                    onSample: (value) => {
                      if (clipSamples.length >= 4)
                        throw new Error('Sample limit')
                      clipSamples.push({ sample: value, step })
                    },
                  })
            const entry = { step, report: result }
            report.results.push(entry)
            notify(() => options.onStep?.(entry, index + 1))
            if (result.status === 'interrupted') {
              abort()
              break
            }
          } catch {
            report.errors.push('step-failed')
            break
          }
        }
        report.wallMs = performance.now() - started
        if (!controller.signal.aborted) {
          if (samples.length) notify(() => options.onSamples?.(samples))
          for (const { sample, step } of clipSamples)
            notify(() => options.onClipSample?.(sample, step))
        }
        report.status = controller.signal.aborted
          ? 'interrupted'
          : report.errors.length ||
              report.results.some(
                (result) => result.report.status !== 'completed',
              )
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
