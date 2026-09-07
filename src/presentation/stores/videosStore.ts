import type { ParsedVideo } from '@domain/entities'
import type { VideoPreviewProduct } from '@domain/repositories/IVideoPreviewCacheRepository'
import type {
  PreviewEnrichmentResult,
  PreviewEnrichmentOptions,
} from '@app/usecases/UpdateVideoPreviewsUseCase'
import {
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  hasCompleteMotionFallback,
  hasUsableMotionPreview,
  keyframeTargets,
  motionClipWindows,
} from '@domain/services/videoPreviewPolicy'
import { defineStore } from 'pinia'
import { computed, inject, reactive, ref, toRaw } from 'vue'
import type {
  VideoIngestionProgress,
  UpdateVideoVotesUseCase,
  VideoIngestionUseCase,
} from '@app/usecases'
import type {
  ILogger,
  IVideoSessionRegistry,
  VideoPreviewGenerationProgress,
  VideoProcessingTiming,
  VideoProcessingPhase,
  VideoProcessingOutcome,
} from '@app/ports'
import { isBrowserPlayableVideoFile } from '@/shared/video/browserPlayableVideoTypes'
import {
  DEFAULT_PREVIEW_FRAME_COUNT,
  hasCompletePreviews,
  hasCompleteVideoPreviews,
} from '@app/services/previewCompleteness'
import type { VideoImportItem } from '@domain/valueObjects'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
  UPDATE_PREVIEWS_USE_CASE_KEY,
  WIPE_VIDEO_DATA_USE_CASE_KEY,
  UPDATE_VOTES_USE_CASE_KEY,
  VIDEO_SESSION_REGISTRY_KEY,
} from '@presentation/di/injectionKeys'

function resolveDependency<T>(dependency: T | undefined, name: string): T {
  if (!dependency) {
    throw new Error(`${name} dependency is missing`)
  }

  return dependency
}

type ThumbnailJobState = 'queued' | 'processing' | 'ready' | 'failed'
type PreviewProductKind = NonNullable<PreviewEnrichmentOptions['product']>
type PreviewProductState = ThumbnailJobState | 'missing' | 'fallback'
type PreviewProductCounts = Record<PreviewProductState, number> & {
  total: number
}
type PreviewProductsSnapshot = Record<PreviewProductKind, PreviewProductCounts>
type PhaseMeasurements = Partial<
  Record<
    VideoProcessingPhase,
    {
      count: number
      completed: number
      failed: number
      aborted: number
      totalMs: number
      maxMs: number
    }
  >
>

function recordPhaseTiming(
  phases: PhaseMeasurements,
  timing: VideoProcessingTiming,
) {
  const aggregate = (phases[timing.phase] ??= {
    count: 0,
    completed: 0,
    failed: 0,
    aborted: 0,
    totalMs: 0,
    maxMs: 0,
  })
  aggregate.count += 1
  aggregate[timing.outcome] += 1
  aggregate.totalMs += timing.durationMs
  aggregate.maxMs = Math.max(aggregate.maxMs, timing.durationMs)
}

function snapshotPhases(phases: PhaseMeasurements): PhaseMeasurements {
  return Object.fromEntries(
    Object.entries(phases).map(([phase, aggregate]) => [
      phase,
      { ...aggregate },
    ]),
  )
}

export type ThumbnailJobDiagnostic = {
  state: ThumbnailJobState
  stage?:
    | VideoPreviewGenerationProgress['stage']
    | 'generating'
    | 'fallback'
    | 'saving-fallback'
  product?: PreviewProductKind
  failures?: PreviewEnrichmentResult['failures']
  cacheFailures?: PreviewEnrichmentResult['cacheFailures']
  startedAtMs?: number
  completedAtMs?: number
  elapsedMs?: number
  completedFrames: number
  totalFrames: number
  timestampSeconds?: number
  outputBytes?: number
  width?: number
  height?: number
  error?: string
}

type IngestionSessionStatus =
  | 'queued'
  | 'ingesting'
  | 'thumbnailing'
  | 'completed'
  | 'failed'

type ConcurrencyMode = 'auto' | 'manual'

type ConcurrencySnapshot = {
  mode: ConcurrencyMode
  requested: number | null
  effective: number
}

type IngestionInputSnapshot = {
  selectedCount: number
  acceptedCount: number
  unsupportedCount: number
  acceptedBytes: number
}

type ThumbnailCountsSnapshot = {
  queued: number
  processing: number
  ready: number
  failed: number
  total: number
  pending: number
}

type PreviewRunSnapshot = {
  products?: PreviewProductsSnapshot
  concurrency: ConcurrencySnapshot
  counts: ThumbnailCountsSnapshot
  peakActiveJobs: number
  peakPendingJobs: number
  completedFrames: number
  totalFrames: number
  outputBytes: number
  dimensions: string[]
  failureStages: string[]
  productFailures: string[]
  cacheFailures: string[]
  timing: {
    startedAtMs: number | null
    completedAtMs: number | null
    elapsedMs: number
    activeElapsedMs: number
    averageMsPerCompletedVideo: number | null
    completedVideosPerSecond: number | null
  }
}

type IngestionSession = {
  id: string
  items: VideoImportItem[]
  status: IngestionSessionStatus
  progress: VideoIngestionProgress | null
  queuedAtMs: number
  input: IngestionInputSnapshot
  foregroundConcurrency: ConcurrencySnapshot
  previewConcurrency: ConcurrencySnapshot
  startedAtMs: number | null
  completedAtMs: number | null
  pipelineCompletedAtMs: number | null
  previewStartedAtMs: number | null
  previewCompletedAtMs: number | null
  previewActiveWindowStartedAtMs: number | null
  previewActiveElapsedMs: number
  previewPeakActiveCount: number
  previewPeakPendingCount: number
  thumbnailVideoIds: string[]
  previewReportSnapshot: PreviewRunSnapshot | null
  foregroundMeasurements: PhaseMeasurements
  previewMeasurements: PhaseMeasurements
  previewAttempts: {
    started: number
    completed: number
    failed: number
    aborted: number
  }
}

type QueuedIngestionRequest = {
  sessionId: string
  resolve: () => void
  reject: (reason?: unknown) => void
}

const THUMBNAIL_BACKGROUND_DELAY_MS = 150
const AUTO_INGESTION_CONCURRENCY = 2
const MAX_INGESTION_CONCURRENCY = 4
const AUTO_THUMBNAIL_CONCURRENCY = 2
const MAX_THUMBNAIL_CONCURRENCY = 4

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const isAbortError = (error: unknown) =>
  (error as { name?: unknown } | null)?.name === 'AbortError'

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const calculateCompletionMetrics = (
  completedVideoCount: number,
  elapsedMs: number | null,
) => {
  if (completedVideoCount <= 0 || elapsedMs == null) {
    return {
      averageMsPerCompletedVideo: null,
      completedVideosPerSecond: null,
    }
  }

  return {
    averageMsPerCompletedVideo: elapsedMs / completedVideoCount,
    completedVideosPerSecond:
      elapsedMs > 0 ? (completedVideoCount * 1000) / elapsedMs : null,
  }
}

export const useVideoStore = defineStore('videos', () => {
  const addVideosUseCase = resolveDependency<VideoIngestionUseCase>(
    inject(ADD_VIDEOS_USE_CASE_KEY),
    'AddVideosUseCase',
  )

  const updatePreviewsUseCase = inject(UPDATE_PREVIEWS_USE_CASE_KEY, undefined)
  const updateThumbUseCase = inject(UPDATE_THUMB_USE_CASE_KEY, undefined)
  if (!updatePreviewsUseCase && !updateThumbUseCase)
    throw new Error('Preview generation dependency is missing')
  const wipeVideoDataUseCase = inject(WIPE_VIDEO_DATA_USE_CASE_KEY, undefined)
  // The legacy branch is used only by explicitly versioned still-pipeline benchmarks.
  const hasReadyThumbnails = updatePreviewsUseCase
    ? hasCompleteVideoPreviews
    : hasCompletePreviews
  const expectedPreviewCount = (video: ParsedVideo) =>
    updatePreviewsUseCase
      ? (hasCompleteMotionFallback(video) && !hasCompleteMotionClips(video)
          ? 9
          : motionClipWindows(video.duration).length) +
        keyframeTargets(video.duration).length
      : DEFAULT_PREVIEW_FRAME_COUNT

  const updateVotesUseCase = resolveDependency<UpdateVideoVotesUseCase>(
    inject(UPDATE_VOTES_USE_CASE_KEY),
    'UpdateVideoVotesUseCase',
  )

  const logger = resolveDependency<ILogger>(inject(LOGGER_KEY), 'Logger')
  const sessionRegistry = resolveDependency<IVideoSessionRegistry>(
    inject(VIDEO_SESSION_REGISTRY_KEY),
    'VideoSessionRegistry',
  )

  const videoMap = reactive(new Map<string, ParsedVideo>())
  const ingestionSessions = reactive(new Map<string, IngestionSession>())
  const queuedIngestionRequests = reactive<QueuedIngestionRequest[]>([])
  const activeIngestionSessionId = ref<string | null>(null)
  const displayedSessionId = ref<string | null>(null)
  const ingestionProgress = ref<VideoIngestionProgress | null>(null)
  const ingestionStartedAtMs = ref<number | null>(null)
  const ingestionCompletedAtMs = ref<number | null>(null)
  const ingestionConcurrencyOverride = ref<number | null>(null)
  const thumbnailConcurrencyOverride = ref<number | null>(null)
  const activeThumbnailJobs = ref(0)
  const ingestionThumbnailVideoIds = reactive<string[]>([])
  const thumbnailJobState = reactive(new Map<string, ThumbnailJobState>())
  const thumbnailVideoSessionIds = reactive(new Map<string, Set<string>>())
  const thumbnailQueue = reactive<string[]>([])
  const thumbnailPriorityQueue = reactive<string[]>([])
  const openPreviewVideoIds = reactive<string[]>([])
  const thumbnailJobPromises = new Map<string, Promise<void>>()
  const thumbnailJobResolvers = new Map<string, () => void>()
  const thumbnailJobDiagnostics = reactive(
    new Map<string, ThumbnailJobDiagnostic>(),
  )
  const thumbnailJobAbortControllers = new Map<string, AbortController>()
  const thumbnailJobsAwaitingResume = new Set<string>()

  let thumbnailPumpTimer: number | null = null
  let nextIngestionSessionId = 1

  const releaseVideoResources = (videoId: string) => {
    try {
      sessionRegistry.unregisterFile(videoId)
    } catch (error) {
      logger.error('Failed to release session video resources', error)
    }
  }

  const getSession = (sessionId: string | null) =>
    sessionId ? ingestionSessions.get(sessionId) ?? null : null

  const syncDisplayedSession = (sessionId: string | null) => {
    displayedSessionId.value = sessionId

    const session = getSession(sessionId)
    ingestionProgress.value = session?.progress ?? null
    ingestionStartedAtMs.value = session?.startedAtMs ?? null
    ingestionCompletedAtMs.value = session?.completedAtMs ?? null
    ingestionThumbnailVideoIds.splice(
      0,
      ingestionThumbnailVideoIds.length,
      ...(session?.thumbnailVideoIds ?? []),
    )
  }

  const createQueuedIngestionSession = (
    items: VideoImportItem[],
    input: IngestionInputSnapshot,
  ) => {
    const sessionId = `ingestion-${nextIngestionSessionId}`
    nextIngestionSessionId += 1

    ingestionSessions.set(sessionId, {
      id: sessionId,
      items,
      status: 'queued',
      progress: null,
      queuedAtMs: Date.now(),
      input,
      foregroundConcurrency: {
        mode: ingestionConcurrencyOverride.value == null ? 'auto' : 'manual',
        requested: ingestionConcurrencyOverride.value,
        effective: effectiveIngestionConcurrency.value,
      },
      previewConcurrency: {
        mode: thumbnailConcurrencyOverride.value == null ? 'auto' : 'manual',
        requested: thumbnailConcurrencyOverride.value,
        effective: effectiveThumbnailConcurrency.value,
      },
      startedAtMs: null,
      completedAtMs: null,
      pipelineCompletedAtMs: null,
      previewStartedAtMs: null,
      previewCompletedAtMs: null,
      previewActiveWindowStartedAtMs: null,
      previewActiveElapsedMs: 0,
      previewPeakActiveCount: 0,
      previewPeakPendingCount: 0,
      thumbnailVideoIds: [],
      previewReportSnapshot: null,
      foregroundMeasurements: {},
      previewMeasurements: {},
      previewAttempts: { started: 0, completed: 0, failed: 0, aborted: 0 },
    })

    return sessionId
  }

  const allVideos = computed<ReadonlyArray<ParsedVideo>>(() =>
    Object.freeze(Array.from(videoMap.values())),
  )

  const autoIngestionConcurrency = computed(() => AUTO_INGESTION_CONCURRENCY)

  const effectiveIngestionConcurrency = computed(
    () => ingestionConcurrencyOverride.value ?? autoIngestionConcurrency.value,
  )

  const autoThumbnailConcurrency = computed(() => AUTO_THUMBNAIL_CONCURRENCY)

  const effectiveThumbnailConcurrency = computed(
    () => thumbnailConcurrencyOverride.value ?? autoThumbnailConcurrency.value,
  )

  const queuedIngestionCount = computed(() => queuedIngestionRequests.length)
  const activeIngestionSession = computed(() =>
    getSession(activeIngestionSessionId.value),
  )
  const displayedIngestionSession = computed(() =>
    getSession(displayedSessionId.value),
  )
  const isPreviewProcessingPaused = ref(false)
  const isWiping = ref(false)
  const isThumbnailDrainPaused = computed(
    () =>
      isPreviewProcessingPaused.value ||
      isWiping.value ||
      activeIngestionSessionId.value !== null ||
      queuedIngestionCount.value > 0,
  )

  const thumbnailQueueSummary = computed(() => {
    let queued = 0
    let processing = 0
    let ready = 0
    let failed = 0

    thumbnailJobState.forEach((state) => {
      if (state === 'queued') {
        queued += 1
      } else if (state === 'processing') {
        processing += 1
      } else if (state === 'ready') {
        ready += 1
      } else if (state === 'failed') {
        failed += 1
      }
    })

    return {
      queued,
      processing,
      ready,
      failed,
      total: queued + processing + ready + failed,
    }
  })

  const summarizeSessionThumbnails = (
    session: IngestionSession,
  ): ThumbnailCountsSnapshot => {
    let queued = 0
    let processing = 0
    let ready = 0
    let failed = 0

    session.thumbnailVideoIds.forEach((videoId) => {
      const state = thumbnailJobState.get(videoId)
      if (state === 'queued') {
        queued += 1
      } else if (state === 'processing') {
        processing += 1
      } else if (state === 'ready') {
        ready += 1
      } else if (state === 'failed') {
        failed += 1
      }
    })

    return {
      queued,
      processing,
      ready,
      failed,
      total: session.thumbnailVideoIds.length,
      pending: queued + processing,
    }
  }

  const createSessionPreviewReport = (
    session: IngestionSession,
  ): PreviewRunSnapshot => {
    const summary = summarizeSessionThumbnails(session)
    const previewDiagnostics = session.thumbnailVideoIds
      .map((videoId) => thumbnailJobDiagnostics.get(videoId))
      .filter(
        (diagnostic): diagnostic is ThumbnailJobDiagnostic =>
          diagnostic != null,
      )
    const nowMs = Date.now()
    const elapsedMs =
      session.previewStartedAtMs == null
        ? 0
        : Math.max(
            (session.previewCompletedAtMs ?? nowMs) -
              session.previewStartedAtMs,
            0,
          )
    const activeElapsedMs =
      session.previewActiveElapsedMs +
      (session.previewActiveWindowStartedAtMs == null
        ? 0
        : Math.max(nowMs - session.previewActiveWindowStartedAtMs, 0))
    const completionMetrics = calculateCompletionMetrics(
      summary.ready + summary.failed,
      activeElapsedMs,
    )

    return {
      ...(updatePreviewsUseCase
        ? { products: summarizeSessionProducts(session) }
        : {}),
      concurrency: { ...session.previewConcurrency },
      counts: { ...summary },
      peakActiveJobs: session.previewPeakActiveCount,
      peakPendingJobs: session.previewPeakPendingCount,
      completedFrames: previewDiagnostics.reduce(
        (total, diagnostic) => total + diagnostic.completedFrames,
        0,
      ),
      totalFrames: previewDiagnostics.reduce(
        (total, diagnostic) => total + diagnostic.totalFrames,
        0,
      ),
      outputBytes: previewDiagnostics.reduce(
        (total, diagnostic) => total + (diagnostic.outputBytes ?? 0),
        0,
      ),
      dimensions: Array.from(
        new Set(
          previewDiagnostics.flatMap((diagnostic) =>
            diagnostic.width != null && diagnostic.height != null
              ? [`${diagnostic.width}x${diagnostic.height}`]
              : [],
          ),
        ),
      ).sort(),
      failureStages: Array.from(
        new Set(
          previewDiagnostics.flatMap((diagnostic) =>
            diagnostic.state === 'failed'
              ? [diagnostic.stage ?? 'unknown']
              : [],
          ),
        ),
      ).sort(),
      productFailures: [
        ...new Set(
          previewDiagnostics.flatMap((diagnostic) =>
            Object.entries(diagnostic.failures ?? {}).map(
              ([kind, reason]) => `${kind}:${reason}`,
            ),
          ),
        ),
      ].sort(),
      cacheFailures: [
        ...new Set(
          previewDiagnostics.flatMap(
            (diagnostic) => diagnostic.cacheFailures ?? [],
          ),
        ),
      ].sort(),
      timing: {
        startedAtMs: session.previewStartedAtMs,
        completedAtMs: session.previewCompletedAtMs,
        elapsedMs,
        activeElapsedMs,
        ...completionMetrics,
      },
    }
  }

  const getThumbnailSessionIds = (videoId: string) =>
    Array.from(thumbnailVideoSessionIds.get(videoId) ?? [])

  const detachSessionFromThumbnailJobs = (session: IngestionSession) => {
    session.thumbnailVideoIds.forEach((videoId) => {
      const sessionIds = thumbnailVideoSessionIds.get(videoId)
      sessionIds?.delete(session.id)
      if (sessionIds?.size === 0) {
        thumbnailVideoSessionIds.delete(videoId)
      }
    })
  }

  const thumbnailGenerationProgress = computed(() => {
    const displayedSession = getSession(displayedSessionId.value)
    const frozenCounts = displayedSession?.previewReportSnapshot?.counts
    const liveCounts = displayedSession
      ? summarizeSessionThumbnails(displayedSession)
      : null
    const counts = frozenCounts ?? liveCounts
    const total = counts?.total ?? 0
    const generatedCount = counts?.ready ?? 0
    const queuedCount = counts?.queued ?? 0
    const processingCount = counts?.processing ?? 0
    const failedCount = counts?.failed ?? 0
    const pendingCount = counts?.pending ?? 0

    return {
      total,
      generatedCount,
      queuedCount,
      processingCount,
      pendingCount,
      failedCount,
      completedCount: generatedCount + failedCount,
      hasWork: total > 0,
      isActive: pendingCount > 0,
    }
  })

  const getPreviewProductState = (
    videoId: string,
    kind: PreviewProductKind,
  ): PreviewProductState | null => {
    if (!updatePreviewsUseCase) return null
    const video = videoMap.get(videoId)
    if (!video) return 'missing'
    const complete =
      kind === 'motionClips' ? hasCompleteMotionClips : hasCompleteKeyframes
    if (complete(video)) return 'ready'
    if (kind === 'motionClips' && hasCompleteMotionFallback(video))
      return 'fallback'
    const diagnostic = thumbnailJobDiagnostics.get(videoId)
    const state = thumbnailJobState.get(videoId)
    if (diagnostic?.failures?.[kind] || state === 'failed') return 'failed'
    if (state === 'processing' && diagnostic?.product === kind)
      return 'processing'
    return state === 'queued' || state === 'processing' ? 'queued' : 'missing'
  }

  const summarizeSessionProducts = (
    session: Pick<IngestionSession, 'thumbnailVideoIds'>,
  ): PreviewProductsSnapshot => {
    const count = (kind: PreviewProductKind): PreviewProductCounts => {
      const counts = {
        ready: 0,
        fallback: 0,
        queued: 0,
        processing: 0,
        failed: 0,
        missing: 0,
        total: session.thumbnailVideoIds.length,
      }
      for (const id of session.thumbnailVideoIds) {
        const state = getPreviewProductState(id, kind)
        if (state) counts[state]++
      }
      return counts
    }
    return { motionClips: count('motionClips'), keyframes: count('keyframes') }
  }

  const previewProductProgress = computed(() => {
    if (!updatePreviewsUseCase) return null
    const session = displayedIngestionSession.value
    return (
      session?.previewReportSnapshot?.products ??
      summarizeSessionProducts(session ?? { thumbnailVideoIds: [] })
    )
  })

  const activePreviewProducts = computed(() =>
    [...thumbnailJobState].flatMap(([videoId, state]) => {
      const diagnostic = thumbnailJobDiagnostics.get(videoId)
      const video = videoMap.get(videoId)
      return state === 'processing' && diagnostic?.product && video
        ? [
            {
              videoId,
              title: video.title,
              product: diagnostic.product,
              stage: diagnostic.stage,
            },
          ]
        : []
    }),
  )

  const refreshSessionPreviewLifecycle = (sessionId: string | null) => {
    const session = getSession(sessionId)
    if (!session || session.previewReportSnapshot) {
      return
    }

    const summary = summarizeSessionThumbnails(session)
    session.previewPeakActiveCount = Math.max(
      session.previewPeakActiveCount,
      summary.processing,
    )
    session.previewPeakPendingCount = Math.max(
      session.previewPeakPendingCount,
      summary.pending,
    )

    const unsettledAttempts =
      session.previewAttempts.started -
      session.previewAttempts.completed -
      session.previewAttempts.failed -
      session.previewAttempts.aborted
    const nowMs = Date.now()
    if (summary.processing > 0 || unsettledAttempts > 0) {
      session.previewActiveWindowStartedAtMs ??= nowMs
    } else if (session.previewActiveWindowStartedAtMs != null) {
      session.previewActiveElapsedMs += Math.max(
        nowMs - session.previewActiveWindowStartedAtMs,
        0,
      )
      session.previewActiveWindowStartedAtMs = null
    }

    if (summary.processing > 0 && session.previewStartedAtMs == null) {
      const recordedStartTimes = session.thumbnailVideoIds
        .map((videoId) => thumbnailJobDiagnostics.get(videoId)?.startedAtMs)
        .filter((value): value is number => value != null)
      session.previewStartedAtMs =
        recordedStartTimes.length > 0
          ? Math.min(...recordedStartTimes)
          : Date.now()
    }

    if (session.completedAtMs == null) {
      return
    }

    let isTerminal = false
    if (session.status === 'failed') {
      session.pipelineCompletedAtMs ??= session.completedAtMs
      isTerminal = true
    } else if (summary.pending > 0 || unsettledAttempts > 0) {
      session.status = 'thumbnailing'
      session.previewCompletedAtMs = null
      session.pipelineCompletedAtMs = null
    } else {
      session.status = 'completed'
      if (summary.total > 0 || session.previewAttempts.started > 0) {
        session.previewCompletedAtMs ??= Date.now()
      }
      session.pipelineCompletedAtMs ??=
        session.previewCompletedAtMs ?? session.completedAtMs
      isTerminal = true
    }

    if (isTerminal) {
      session.previewReportSnapshot = createSessionPreviewReport(session)
      detachSessionFromThumbnailJobs(session)
    }

    if (displayedSessionId.value === session.id) {
      syncDisplayedSession(session.id)
    }
  }

  const refreshThumbnailSessions = (sessionIds: string[]) => {
    sessionIds.forEach(refreshSessionPreviewLifecycle)
  }

  const refreshThumbnailOwningSessions = (videoId: string) => {
    refreshThumbnailSessions(getThumbnailSessionIds(videoId))
  }

  const isIngesting = computed(() =>
    Boolean(
      activeIngestionSessionId.value !== null ||
        (ingestionProgress.value &&
          ingestionProgress.value.completedCount <
            ingestionProgress.value.total),
    ),
  )

  const shouldShowProgressToast = computed(() =>
    Boolean(
      ingestionProgress.value &&
        (isIngesting.value ||
          thumbnailGenerationProgress.value.isActive ||
          thumbnailGenerationProgress.value.failedCount > 0),
    ),
  )

  const ensureThumbnailJobPromise = (videoId: string) => {
    const existingPromise = thumbnailJobPromises.get(videoId)
    if (existingPromise) {
      return existingPromise
    }

    const promise = new Promise<void>((resolve) => {
      thumbnailJobResolvers.set(videoId, resolve)
    })
    thumbnailJobPromises.set(videoId, promise)
    return promise
  }

  const settleThumbnailJob = (videoId: string) => {
    thumbnailJobResolvers.get(videoId)?.()
    thumbnailJobResolvers.delete(videoId)
    thumbnailJobPromises.delete(videoId)
  }

  const interruptActiveThumbnailJobs = () => {
    thumbnailJobAbortControllers.forEach((controller, videoId) => {
      if (controller.signal.aborted) {
        return
      }

      thumbnailJobsAwaitingResume.add(videoId)
      controller.abort()
    })
  }

  const clearThumbnailPumpTimer = () => {
    if (thumbnailPumpTimer !== null) {
      clearTimeout(thumbnailPumpTimer)
      thumbnailPumpTimer = null
    }
  }

  const removeQueuedThumbnailJob = (videoId: string) => {
    const backgroundIndex = thumbnailQueue.indexOf(videoId)
    if (backgroundIndex >= 0) {
      thumbnailQueue.splice(backgroundIndex, 1)
    }

    const priorityIndex = thumbnailPriorityQueue.indexOf(videoId)
    if (priorityIndex >= 0) {
      thumbnailPriorityQueue.splice(priorityIndex, 1)
    }
  }

  const removeTrackedIngestionThumbnailVideo = (videoId: string) => {
    const sessionIds = getThumbnailSessionIds(videoId)

    sessionIds.forEach((sessionId) => {
      const session = ingestionSessions.get(sessionId)
      if (session) {
        const trackedIndex = session.thumbnailVideoIds.indexOf(videoId)
        if (trackedIndex >= 0) {
          session.thumbnailVideoIds.splice(trackedIndex, 1)
        }

        if (displayedSessionId.value === sessionId) {
          syncDisplayedSession(sessionId)
        }
      }
    })

    thumbnailVideoSessionIds.delete(videoId)
    return sessionIds
  }

  const trackIngestionThumbnailVideo = (sessionId: string, videoId: string) => {
    const session = ingestionSessions.get(sessionId)
    if (!session) {
      return
    }

    if (!session.thumbnailVideoIds.includes(videoId)) {
      session.thumbnailVideoIds.push(videoId)
    }

    let sessionIds = thumbnailVideoSessionIds.get(videoId)
    if (!sessionIds) {
      sessionIds = new Set<string>()
      thumbnailVideoSessionIds.set(videoId, sessionIds)
    }
    sessionIds.add(sessionId)

    if (displayedSessionId.value === sessionId) {
      syncDisplayedSession(sessionId)
    }
  }

  const clearThumbnailTracking = (videoId: string) => {
    const controller = thumbnailJobAbortControllers.get(videoId)
    thumbnailJobsAwaitingResume.delete(videoId)
    thumbnailJobAbortControllers.delete(videoId)
    controller?.abort()

    removeQueuedThumbnailJob(videoId)
    const openIndex = openPreviewVideoIds.indexOf(videoId)
    if (openIndex >= 0) openPreviewVideoIds.splice(openIndex, 1)
    const sessionIds = removeTrackedIngestionThumbnailVideo(videoId)
    thumbnailJobState.delete(videoId)
    thumbnailJobDiagnostics.delete(videoId)
    settleThumbnailJob(videoId)
    refreshThumbnailSessions(sessionIds)
  }

  const startNextQueuedIngestion = () => {
    if (
      isWiping.value ||
      activeIngestionSessionId.value !== null ||
      activeThumbnailJobs.value > 0
    ) {
      return
    }

    const nextRequest = queuedIngestionRequests.shift()
    if (!nextRequest) {
      scheduleThumbnailPump()
      return
    }

    void runQueuedIngestion(nextRequest)
  }

  const runQueuedIngestion = async (request: QueuedIngestionRequest) => {
    const session = ingestionSessions.get(request.sessionId)
    if (!session) {
      request.resolve()
      return
    }

    activeIngestionSessionId.value = session.id
    session.status = 'ingesting'
    session.progress = null
    session.startedAtMs = Date.now()
    session.completedAtMs = null
    syncDisplayedSession(session.id)

    const deferredThumbnailQueue: ParsedVideo[] = []
    const items = session.items
    session.items = []
    let acceptingTimings = true

    try {
      for await (const item of addVideosUseCase.execute(items, {
        concurrency: session.foregroundConcurrency.effective,
        onTiming: (timing) => {
          if (acceptingTimings)
            recordPhaseTiming(session.foregroundMeasurements, timing)
        },
      })) {
        if (item.type === 'video') {
          addVideos([item.video])
          deferredThumbnailQueue.push(
            toRaw(videoMap.get(item.video.id)) ?? item.video,
          )
        } else {
          session.progress = item.progress
          syncDisplayedSession(session.id)
        }
      }

      deferredThumbnailQueue.forEach((video) => {
        queueBackgroundThumbnailJob(video, session.id)
      })

      session.status =
        session.thumbnailVideoIds.length > 0 ? 'thumbnailing' : 'completed'
      request.resolve()
    } catch (error) {
      session.status = 'failed'
      logger.error('Failed to ingest queued videos', error)
      request.reject(error)
    } finally {
      acceptingTimings = false
      session.completedAtMs = Date.now()
      activeIngestionSessionId.value = null
      refreshSessionPreviewLifecycle(session.id)
      syncDisplayedSession(session.id)

      if (queuedIngestionRequests.length > 0) {
        startNextQueuedIngestion()
      } else {
        scheduleThumbnailPump()
      }
    }
  }

  const pendingPreviewProducts = (
    videoId: string,
    failures = thumbnailJobDiagnostics.get(videoId)?.failures,
  ): PreviewProductKind[] => {
    const video = videoMap.get(videoId)
    if (!video) return []
    const pending: PreviewProductKind[] = []
    if (!hasUsableMotionPreview(video) && !failures?.motionClips)
      pending.push('motionClips')
    if (!hasCompleteKeyframes(video) && !failures?.keyframes)
      pending.push('keyframes')
    return pending
  }

  const getNextThumbnailJob = ():
    | {
        videoId: string
        product?: PreviewProductKind
      }
    | undefined => {
    const candidates = [...thumbnailPriorityQueue, ...thumbnailQueue]
    if (!updatePreviewsUseCase) {
      return candidates[0] ? { videoId: candidates[0] } : undefined
    }
    // Keep FIFO membership through both products; processing entries are ineligible.
    const pending = new Map(
      candidates
        .filter((id) => thumbnailJobState.get(id) === 'queued')
        .map((id) => [id, pendingPreviewProducts(id)]),
    )
    const openVideoId = openPreviewVideoIds.find((id) =>
      pending.get(id)?.includes('keyframes'),
    )
    if (openVideoId) return { videoId: openVideoId, product: 'keyframes' }
    for (const product of ['motionClips', 'keyframes'] as const) {
      for (const [videoId, products] of pending) {
        if (products.includes(product)) return { videoId, product }
      }
    }
    // A source can become complete or disappear while queued; let the pump retire it.
    const videoId = pending.keys().next().value
    return videoId ? { videoId } : undefined
  }

  const getNextThumbnailConcurrency = (nextVideoId?: string) => {
    const sessionLimits = nextVideoId
      ? getThumbnailSessionIds(nextVideoId).flatMap((sessionId) => {
          const session = getSession(sessionId)
          return session ? [session.previewConcurrency.effective] : []
        })
      : []

    return sessionLimits.length > 0
      ? Math.min(...sessionLimits)
      : effectiveThumbnailConcurrency.value
  }

  const pumpThumbnailQueue = () => {
    clearThumbnailPumpTimer()

    if (isThumbnailDrainPaused.value) {
      return
    }

    for (
      let nextJob = getNextThumbnailJob();
      nextJob;
      nextJob = getNextThumbnailJob()
    ) {
      if (
        activeThumbnailJobs.value >=
        getNextThumbnailConcurrency(nextJob.videoId)
      )
        break
      const { videoId: nextVideoId, product } = nextJob
      if (!updatePreviewsUseCase) removeQueuedThumbnailJob(nextVideoId)

      const sessionIds = getThumbnailSessionIds(nextVideoId)

      const video = toRaw(videoMap.get(nextVideoId))
      if (!video) {
        clearThumbnailTracking(nextVideoId)
        continue
      }

      if (hasReadyThumbnails(video)) {
        removeQueuedThumbnailJob(nextVideoId)
        thumbnailJobState.set(nextVideoId, 'ready')
        settleThumbnailJob(nextVideoId)
        refreshThumbnailSessions(sessionIds)
        continue
      }

      if (thumbnailJobState.get(nextVideoId) !== 'queued') {
        continue
      }

      if (updatePreviewsUseCase && !product) {
        removeQueuedThumbnailJob(nextVideoId)
        thumbnailJobState.set(nextVideoId, 'failed')
        settleThumbnailJob(nextVideoId)
        refreshThumbnailSessions(sessionIds)
        continue
      }

      const abortController = new AbortController()
      const ownsAttempt = () =>
        thumbnailJobAbortControllers.get(nextVideoId) === abortController
      const startedAtMs = Date.now()
      let shouldSettleJob = true
      let acceptingTimings = true
      let attemptOutcome: VideoProcessingOutcome = 'failed'
      // Capture ownership now: a later import must not inherit earlier attempt work.
      const measurementSessions = sessionIds.flatMap((id) => {
        const session = getSession(id)
        return session && !session.previewReportSnapshot ? [session] : []
      })
      measurementSessions.forEach((session) => {
        session.previewAttempts.started += 1
      })

      activeThumbnailJobs.value += 1
      thumbnailJobState.set(nextVideoId, 'processing')
      thumbnailJobAbortControllers.set(nextVideoId, abortController)
      thumbnailJobDiagnostics.set(nextVideoId, {
        failures: thumbnailJobDiagnostics.get(nextVideoId)?.failures,
        cacheFailures: thumbnailJobDiagnostics.get(nextVideoId)?.cacheFailures,
        state: 'processing',
        stage: 'loading',
        product,
        startedAtMs,
        completedFrames: 0,
        totalFrames: expectedPreviewCount(video),
      })
      refreshThumbnailSessions(sessionIds)

      const options = {
        signal: abortController.signal,
        onTiming: (timing: VideoProcessingTiming) => {
          if (acceptingTimings) {
            measurementSessions.forEach((session) =>
              recordPhaseTiming(session.previewMeasurements, timing),
            )
          }
        },
        onProduct: (product: VideoPreviewProduct) => {
          if (!ownsAttempt() || abortController.signal.aborted) return
          const current = toRaw(videoMap.get(nextVideoId))
          if (current)
            videoMap.set(nextVideoId, mergePreviewProduct(current, product))
        },
        onProgress: (
          progress:
            | VideoPreviewGenerationProgress
            | Parameters<
                NonNullable<PreviewEnrichmentOptions['onProgress']>
              >[0],
        ) => {
          if (!ownsAttempt() || abortController.signal.aborted) {
            return
          }

          const currentDiagnostic = thumbnailJobDiagnostics.get(nextVideoId)
          thumbnailJobDiagnostics.set(nextVideoId, {
            ...currentDiagnostic,
            state: 'processing',
            startedAtMs,
            ...('kind' in progress
              ? {
                  stage: progress.stage,
                  product: progress.kind,
                  completedFrames: progress.completed,
                  totalFrames: progress.total,
                }
              : progress),
          })
        },
      }
      const work = updatePreviewsUseCase
        ? updatePreviewsUseCase.execute(video, { ...options, product })
        : updateThumbUseCase!.execute(video, options)
      void work
        .then((result) => {
          acceptingTimings = false
          if (!ownsAttempt()) return
          // A cancelled adapter may still resolve. Never publish that stale result.
          abortController.signal.throwIfAborted()
          thumbnailJobsAwaitingResume.delete(nextVideoId)
          const currentVideo = toRaw(videoMap.get(nextVideoId))
          if (!currentVideo) {
            clearThumbnailTracking(nextVideoId)
            return
          }

          if ('failures' in result) {
            const ready = hasReadyThumbnails(currentVideo)
            const prior = thumbnailJobDiagnostics.get(nextVideoId)
            const failures = { ...prior?.failures, ...result.failures }
            if (product && !result.failures[product]) {
              const complete =
                product === 'motionClips'
                  ? hasUsableMotionPreview(currentVideo)
                  : hasCompleteKeyframes(currentVideo)
              if (!complete) failures[product] = 'output-invalid'
            }
            if (product && !failures[product]) attemptOutcome = 'completed'
            const products = [
              ...(hasCompleteMotionClips(currentVideo)
                ? currentVideo.motionClips
                : currentVideo.motionFallback?.items ?? []),
              ...currentVideo.keyframes,
            ]
            const hasPendingProduct =
              pendingPreviewProducts(nextVideoId, failures).length > 0
            const state = ready
              ? 'ready'
              : hasPendingProduct
                ? 'queued'
                : 'failed'
            const completedAtMs = Date.now()
            thumbnailJobDiagnostics.set(nextVideoId, {
              state,
              startedAtMs,
              completedAtMs,
              elapsedMs: completedAtMs - startedAtMs,
              completedFrames: products.length,
              totalFrames: expectedPreviewCount(currentVideo),
              outputBytes: products.reduce(
                (sum, frame) => sum + frame.blob.size,
                0,
              ),
              failures,
              cacheFailures: [
                ...new Set([
                  ...(prior?.cacheFailures ?? []),
                  ...result.cacheFailures,
                ]),
              ],
              error: ready
                ? undefined
                : Object.entries(failures)
                    .map(([kind, reason]) => `${kind}: ${reason}`)
                    .join('; ') || undefined,
            })
            thumbnailJobState.set(nextVideoId, state)
            // A product boundary yields the worker slot, not the whole video's promise.
            shouldSettleJob = !hasPendingProduct
            return
          }
          const updated = result

          if (hasReadyThumbnails(updated)) {
            if (!abortController.signal.aborted) attemptOutcome = 'completed'
            videoMap.set(
              nextVideoId,
              mergeThumbnailUpdateIntoCurrentVideo(currentVideo, updated),
            )
            thumbnailJobState.set(nextVideoId, 'ready')

            const completedAtMs = Date.now()
            const frames = updated.previewFrames
            const firstFrame = frames[0]
            const completedFrames =
              frames.length > 0 ? frames.length : updated.thumbUrls.length
            thumbnailJobDiagnostics.set(nextVideoId, {
              ...thumbnailJobDiagnostics.get(nextVideoId),
              state: 'ready',
              startedAtMs,
              completedAtMs,
              elapsedMs: completedAtMs - startedAtMs,
              completedFrames,
              totalFrames: DEFAULT_PREVIEW_FRAME_COUNT,
              outputBytes: frames.reduce(
                (total, frame) => total + frame.blob.size,
                0,
              ),
              width: firstFrame?.width,
              height: firstFrame?.height,
              error: undefined,
            })
            return
          }

          thumbnailJobState.set(nextVideoId, 'failed')
          const completedAtMs = Date.now()
          thumbnailJobDiagnostics.set(nextVideoId, {
            ...thumbnailJobDiagnostics.get(nextVideoId),
            state: 'failed',
            startedAtMs,
            completedAtMs,
            elapsedMs: completedAtMs - startedAtMs,
            completedFrames: updated.previewFrames.length,
            totalFrames: DEFAULT_PREVIEW_FRAME_COUNT,
            error: `Preview generation did not return the expected ${DEFAULT_PREVIEW_FRAME_COUNT} frames`,
          })
        })
        .catch((error) => {
          acceptingTimings = false
          if (!ownsAttempt()) return
          if (abortController.signal.aborted && isAbortError(error)) {
            attemptOutcome = 'aborted'
            const shouldRequeue =
              thumbnailJobsAwaitingResume.delete(nextVideoId) &&
              videoMap.has(nextVideoId)

            if (shouldRequeue) {
              shouldSettleJob = false
              thumbnailJobState.set(nextVideoId, 'queued')
              removeQueuedThumbnailJob(nextVideoId)
              thumbnailQueue.unshift(nextVideoId)
              const currentDiagnostic = thumbnailJobDiagnostics.get(nextVideoId)
              thumbnailJobDiagnostics.set(nextVideoId, {
                ...currentDiagnostic,
                state: 'queued',
                completedFrames: currentDiagnostic?.completedFrames ?? 0,
                totalFrames: currentDiagnostic?.totalFrames ?? 0,
                error: undefined,
              })
              return
            }

            if (!videoMap.has(nextVideoId)) {
              clearThumbnailTracking(nextVideoId)
            }
            return
          }

          thumbnailJobsAwaitingResume.delete(nextVideoId)
          if (!videoMap.has(nextVideoId)) {
            clearThumbnailTracking(nextVideoId)
            return
          }

          thumbnailJobState.set(nextVideoId, 'failed')
          const completedAtMs = Date.now()
          thumbnailJobDiagnostics.set(nextVideoId, {
            ...thumbnailJobDiagnostics.get(nextVideoId),
            state: 'failed',
            startedAtMs,
            completedAtMs,
            elapsedMs: completedAtMs - startedAtMs,
            completedFrames:
              thumbnailJobDiagnostics.get(nextVideoId)?.completedFrames ?? 0,
            totalFrames:
              thumbnailJobDiagnostics.get(nextVideoId)?.totalFrames ?? 0,
            error: describeError(error),
          })
          logger.error('Failed to update thumbnails', error)
        })
        .finally(() => {
          acceptingTimings = false
          if (abortController.signal.aborted) attemptOutcome = 'aborted'
          measurementSessions.forEach((session) => {
            session.previewAttempts[attemptOutcome] += 1
          })
          if (ownsAttempt()) {
            thumbnailJobAbortControllers.delete(nextVideoId)
            if (shouldSettleJob) {
              removeQueuedThumbnailJob(nextVideoId)
              settleThumbnailJob(nextVideoId)
            }
          }
          activeThumbnailJobs.value = Math.max(activeThumbnailJobs.value - 1, 0)
          refreshThumbnailSessions(sessionIds)
          startNextQueuedIngestion()
          pumpThumbnailQueue()
        })
    }
  }

  const scheduleThumbnailPump = (priority = false) => {
    if (isThumbnailDrainPaused.value) {
      clearThumbnailPumpTimer()
      return
    }

    if (priority) {
      pumpThumbnailQueue()
      return
    }

    if (thumbnailPumpTimer !== null) {
      return
    }

    thumbnailPumpTimer = window.setTimeout(
      pumpThumbnailQueue,
      THUMBNAIL_BACKGROUND_DELAY_MS,
    )
  }

  const queueThumbnailJob = (videoId: string, priority = false) => {
    if (isWiping.value) return Promise.resolve()
    const video = toRaw(videoMap.get(videoId))
    if (!video) {
      return Promise.resolve()
    }

    if (hasReadyThumbnails(video)) {
      // Published products can still be saving. Only retire an inactive job here.
      const activePromise = thumbnailJobAbortControllers.has(videoId)
        ? thumbnailJobPromises.get(videoId)
        : undefined
      if (activePromise) return activePromise
      const state = thumbnailJobState.get(videoId)
      if (state && state !== 'ready') {
        thumbnailJobState.set(videoId, 'ready')
        thumbnailJobDiagnostics.set(videoId, {
          ...thumbnailJobDiagnostics.get(videoId),
          state: 'ready',
          stage: undefined,
          product: undefined,
          error: undefined,
          failures: undefined,
          completedFrames: expectedPreviewCount(video),
          totalFrames: expectedPreviewCount(video),
        })
      }
      removeQueuedThumbnailJob(videoId)
      settleThumbnailJob(videoId)
      refreshThumbnailOwningSessions(videoId)
      return Promise.resolve()
    }

    const existingPromise = thumbnailJobPromises.get(videoId)
    if (existingPromise) {
      if (priority && thumbnailJobState.get(videoId) === 'queued') {
        removeQueuedThumbnailJob(videoId)
        thumbnailPriorityQueue.push(videoId)
        scheduleThumbnailPump(true)
      }

      return existingPromise
    }

    thumbnailJobState.set(videoId, 'queued')
    thumbnailJobDiagnostics.set(videoId, {
      state: 'queued',
      completedFrames: 0,
      totalFrames: 0,
    })
    removeQueuedThumbnailJob(videoId)
    if (priority) {
      thumbnailPriorityQueue.push(videoId)
    } else {
      thumbnailQueue.push(videoId)
    }

    const promise = ensureThumbnailJobPromise(videoId)
    scheduleThumbnailPump(priority)
    return promise
  }

  const queueBackgroundThumbnailJob = (
    video: ParsedVideo,
    sessionId: string,
  ) => {
    if (hasReadyThumbnails(video)) {
      return
    }

    trackIngestionThumbnailVideo(sessionId, video.id)
    void queueThumbnailJob(video.id)
    refreshSessionPreviewLifecycle(sessionId)
  }

  const mergeThumbnailUpdateIntoCurrentVideo = (
    currentVideo: ParsedVideo,
    updatedVideo: ParsedVideo,
  ): ParsedVideo => ({
    ...currentVideo,
    ...updatedVideo,
    url: currentVideo.url,
    pinned: currentVideo.pinned,
    votes: currentVideo.votes,
  })

  const mergePreviewProduct = (
    current: ParsedVideo,
    product: VideoPreviewProduct,
  ): ParsedVideo => {
    if (product.kind === 'motionFallback') {
      const candidate = {
        ...current,
        motionFallback: {
          version: product.version,
          reason: product.reason,
          items: product.items,
        },
      }
      return hasCompleteMotionFallback(candidate) ? candidate : current
    }
    const candidate = {
      ...current,
      [product.kind]: product.items,
      previewVersions: {
        ...current.previewVersions,
        [product.kind]: product.version,
      },
    }
    const complete =
      product.kind === 'motionClips'
        ? hasCompleteMotionClips
        : hasCompleteKeyframes
    return complete(candidate) ? candidate : current
  }

  function addVideos(videos: ParsedVideo[]) {
    videos.forEach((video) => {
      const existing = toRaw(videoMap.get(video.id))
      if (existing) {
        if (updatePreviewsUseCase) {
          let hydrated = existing
          if (
            !hasCompleteMotionFallback(hydrated) &&
            hasCompleteMotionFallback(video)
          ) {
            hydrated = mergePreviewProduct(hydrated, {
              kind: 'motionFallback',
              ...video.motionFallback!,
            })
          }
          for (const kind of ['motionClips', 'keyframes'] as const) {
            const complete =
              kind === 'motionClips'
                ? hasCompleteMotionClips
                : hasCompleteKeyframes
            if (!complete(hydrated) && complete(video)) {
              hydrated = mergePreviewProduct(hydrated, {
                kind,
                version: video.previewVersions[kind]!,
                items: video[kind],
              } as VideoPreviewProduct)
            }
          }
          videoMap.set(video.id, hydrated)
        } else if (!hasReadyThumbnails(existing) && hasReadyThumbnails(video)) {
          videoMap.set(video.id, {
            ...existing,
            previewFrames: video.previewFrames,
            thumbUrls: video.thumbUrls,
          })
        }
        return
      }

      videoMap.set(video.id, video)
    })
  }

  function setPreviewProcessingPaused(paused: boolean) {
    if (paused === isPreviewProcessingPaused.value) return
    isPreviewProcessingPaused.value = paused
    if (paused) {
      clearThumbnailPumpTimer()
      interruptActiveThumbnailJobs()
    } else {
      scheduleThumbnailPump(true)
    }
  }

  function removeVideo(videoId: string) {
    const existing = toRaw(videoMap.get(videoId))
    if (existing) {
      releaseVideoResources(videoId)
    }

    clearThumbnailTracking(videoId)
    videoMap.delete(videoId)
  }

  function togglePinVideo(videoId: string) {
    const video = videoMap.get(videoId)

    if (video) {
      video.pinned = !video.pinned
    }
  }

  function removeAllUnpinned() {
    const unpinnedVideos = Array.from(videoMap.values()).filter(
      (video) => !video.pinned,
    )

    unpinnedVideos.forEach((video) => {
      releaseVideoResources(video.id)
      clearThumbnailTracking(video.id)
      videoMap.delete(video.id)
    })
  }

  async function updateVotes(videoId: string, delta: number) {
    const video = videoMap.get(videoId)
    if (!video) {
      return
    }

    try {
      const votes = await updateVotesUseCase.execute(videoId, delta)
      const currentVideo = videoMap.get(videoId)
      if (votes != null && currentVideo) {
        currentVideo.votes = votes
      }
    } catch (error) {
      logger.error('Failed to update votes', error)
    }
  }

  async function addVideosFromFiles(files: FileList) {
    if (isWiping.value) throw new Error('Wait for the database wipe to finish')
    const selectedFiles = Array.from(files)
    const items: VideoImportItem[] = selectedFiles
      .filter(isBrowserPlayableVideoFile)
      .map((file) => ({ file }))

    if (!items.length) {
      return
    }

    const sessionId = createQueuedIngestionSession(items, {
      selectedCount: selectedFiles.length,
      acceptedCount: items.length,
      unsupportedCount: selectedFiles.length - items.length,
      acceptedBytes: items.reduce((total, item) => total + item.file.size, 0),
    })
    clearThumbnailPumpTimer()

    return await new Promise<void>((resolve, reject) => {
      queuedIngestionRequests.push({
        sessionId,
        resolve,
        reject,
      })

      interruptActiveThumbnailJobs()
      startNextQueuedIngestion()
    })
  }

  async function updateVideoThumbnails(id: string) {
    await queueThumbnailJob(id, true)
  }

  function requestThumbnailWarmup(id: string) {
    if (thumbnailJobState.get(id) === 'failed') return
    void queueThumbnailJob(id, true)
  }

  function setVideoPreviewOpen(id: string, open: boolean) {
    if (!updatePreviewsUseCase || isWiping.value) return
    const index = openPreviewVideoIds.indexOf(id)
    if (!open) {
      if (index >= 0) openPreviewVideoIds.splice(index, 1)
      return
    }
    if (!videoMap.has(id) || index >= 0) return
    openPreviewVideoIds.unshift(id)
    if (thumbnailJobState.get(id) !== 'failed') void queueThumbnailJob(id)
    scheduleThumbnailPump(true)
  }

  async function wipeVideoData() {
    if (!wipeVideoDataUseCase)
      throw new Error('WipeVideoDataUseCase dependency is missing')
    if (isWiping.value || isIngesting.value || queuedIngestionCount.value > 0)
      throw new Error(
        'Wait for foreground ingestion to finish before wiping data',
      )
    isWiping.value = true
    clearThumbnailPumpTimer()
    for (const id of videoMap.keys()) clearThumbnailTracking(id)
    try {
      await wipeVideoDataUseCase.execute()
      for (const id of videoMap.keys()) releaseVideoResources(id)
      videoMap.clear()
    } finally {
      isWiping.value = false
    }
  }

  function setThumbnailConcurrencyOverride(value: number | null) {
    if (value == null) {
      thumbnailConcurrencyOverride.value = null
    } else {
      const normalizedValue = Number.isFinite(value)
        ? Math.trunc(value)
        : AUTO_THUMBNAIL_CONCURRENCY
      thumbnailConcurrencyOverride.value = clamp(
        normalizedValue,
        1,
        MAX_THUMBNAIL_CONCURRENCY,
      )
    }

    startNextQueuedIngestion()
    pumpThumbnailQueue()
  }

  function setIngestionConcurrencyOverride(value: number | null) {
    if (value == null) {
      ingestionConcurrencyOverride.value = null
      return
    }

    const normalizedValue = Number.isFinite(value)
      ? Math.trunc(value)
      : AUTO_INGESTION_CONCURRENCY
    ingestionConcurrencyOverride.value = clamp(
      normalizedValue,
      1,
      MAX_INGESTION_CONCURRENCY,
    )
  }

  function getThumbnailJobState(videoId: string) {
    return thumbnailJobState.get(videoId)
  }

  function getThumbnailJobDiagnostic(videoId: string) {
    return thumbnailJobDiagnostics.get(videoId)
  }

  function createIngestionRunReport(sessionId: string | null) {
    const session = getSession(sessionId)
    if (!session) {
      return null
    }

    const progress = session.progress
    const previewReport =
      session.previewReportSnapshot ?? createSessionPreviewReport(session)
    const nowMs = Date.now()
    const foregroundElapsedMs =
      progress?.elapsedMs ??
      (session.startedAtMs == null
        ? null
        : Math.max((session.completedAtMs ?? nowMs) - session.startedAtMs, 0))
    const foregroundCompletionMetrics = calculateCompletionMetrics(
      progress?.completedCount ?? 0,
      foregroundElapsedMs,
    )
    const pipelineElapsedMs = Math.max(
      (session.pipelineCompletedAtMs ?? nowMs) - session.queuedAtMs,
      0,
    )

    return {
      schemaVersion: 1 as const,
      sessionId: session.id,
      status: session.status,
      measurements: {
        version: 1 as const,
        backend: updatePreviewsUseCase
          ? ('mediabunny' as const)
          : ('dom' as const),
        workersEnabled: !!updatePreviewsUseCase,
        ...(updatePreviewsUseCase
          ? { foregroundBackend: 'dom', previewPhaseTimingsAvailable: false }
          : {}),
        fallbackReason: null,
        foregroundCancellationSupported: false,
        foreground: snapshotPhases(session.foregroundMeasurements),
        previews: snapshotPhases(session.previewMeasurements),
        previewAttempts: {
          ...session.previewAttempts,
          settled:
            session.previewAttempts.completed +
            session.previewAttempts.failed +
            session.previewAttempts.aborted,
        },
      },
      input: { ...session.input },
      timing: {
        queuedAtMs: session.queuedAtMs,
        foregroundStartedAtMs: session.startedAtMs,
        foregroundCompletedAtMs: session.completedAtMs,
        pipelineCompletedAtMs: session.pipelineCompletedAtMs,
        queueWaitMs:
          session.startedAtMs == null
            ? null
            : Math.max(session.startedAtMs - session.queuedAtMs, 0),
        foregroundElapsedMs,
        pipelineElapsedMs,
      },
      foreground: {
        phase: progress?.phase ?? session.status,
        concurrency: {
          ...session.foregroundConcurrency,
          peakActiveJobs: progress?.peakActiveItemCount ?? 0,
        },
        activeJobs: progress?.activeItemCount ?? 0,
        pendingJobs: progress?.pendingItemCount ?? session.input.acceptedCount,
        peakPendingJobs: progress?.peakPendingItemCount ?? 0,
        phaseCompleted: progress?.phaseCompletedCount ?? 0,
        phaseTotal: progress?.phaseTotal ?? session.input.acceptedCount,
        counts: {
          total: progress?.total ?? session.input.acceptedCount,
          scanned: progress?.scanned ?? 0,
          existing: progress?.existingCount ?? 0,
          new: progress?.newCount ?? 0,
          retryQueue: progress?.knownErrorCount ?? 0,
          created: progress?.createdCount ?? 0,
          failed: progress?.failedCount ?? 0,
          skipped: progress?.skippedCount ?? 0,
          duplicates: progress?.duplicateCount ?? 0,
          completed: progress?.completedCount ?? 0,
        },
        timings: {
          identificationMs: progress?.identificationElapsedMs ?? null,
          classificationMs: progress?.classificationElapsedMs ?? null,
          processingMs: progress?.processingElapsedMs ?? null,
          totalMs: foregroundElapsedMs,
          ...foregroundCompletionMetrics,
        },
      },
      backgroundPreviews: {
        concurrency: { ...previewReport.concurrency },
        counts: { ...previewReport.counts },
        peakActiveJobs: previewReport.peakActiveJobs,
        peakPendingJobs: previewReport.peakPendingJobs,
        completedFrames: previewReport.completedFrames,
        totalFrames: previewReport.totalFrames,
        outputBytes: previewReport.outputBytes,
        dimensions: [...previewReport.dimensions],
        failureStages: [...previewReport.failureStages],
        ...(updatePreviewsUseCase
          ? {
              productFailures: [...previewReport.productFailures],
              cacheFailures: [...previewReport.cacheFailures],
            }
          : {}),
        timing: { ...previewReport.timing },
      },
      environment: {
        userAgent:
          typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
        hardwareConcurrency:
          typeof navigator === 'undefined'
            ? null
            : navigator.hardwareConcurrency || null,
      },
    }
  }

  function createDisplayedIngestionRunReport() {
    return createIngestionRunReport(displayedSessionId.value)
  }

  return {
    ingestionProgress,
    ingestionStartedAtMs,
    ingestionCompletedAtMs,
    ingestionConcurrencyOverride,
    autoIngestionConcurrency,
    effectiveIngestionConcurrency,
    isIngesting,
    activeIngestionSession,
    displayedIngestionSession,
    queuedIngestionCount,
    isThumbnailDrainPaused,
    isPreviewProcessingPaused,
    isWiping,
    wipeVideoData,
    setPreviewProcessingPaused,
    thumbnailConcurrencyOverride,
    autoThumbnailConcurrency,
    effectiveThumbnailConcurrency,
    thumbnailQueueSummary,
    thumbnailGenerationProgress,
    shouldShowProgressToast,
    allVideos,
    addVideos,
    addVideosFromFiles,
    removeVideo,
    removeAllUnpinned,
    setIngestionConcurrencyOverride,
    setThumbnailConcurrencyOverride,
    getThumbnailJobState,
    getThumbnailJobDiagnostic,
    createIngestionRunReport,
    createDisplayedIngestionRunReport,
    togglePinVideo,
    requestThumbnailWarmup,
    updateVideoThumbnails,
    setVideoPreviewOpen,
    getPreviewProductState,
    previewProductProgress,
    activePreviewProducts,
    updateVotes,
  }
})
