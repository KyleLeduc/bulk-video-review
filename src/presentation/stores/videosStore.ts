import type { ParsedVideo } from '@domain/entities'
import { defineStore } from 'pinia'
import { computed, inject, reactive, ref, toRaw } from 'vue'
import type {
  VideoIngestionProgress,
  UpdateVideoThumbnailsUseCase,
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
import type { VideoImportItem } from '@domain/valueObjects'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  LOGGER_KEY,
  UPDATE_THUMB_USE_CASE_KEY,
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
  stage?: VideoPreviewGenerationProgress['stage']
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
  concurrency: ConcurrencySnapshot
  counts: ThumbnailCountsSnapshot
  peakActiveJobs: number
  peakPendingJobs: number
  completedFrames: number
  totalFrames: number
  outputBytes: number
  dimensions: string[]
  failureStages: string[]
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
const AUTO_THUMBNAIL_CONCURRENCY = 1
const MAX_THUMBNAIL_CONCURRENCY = 4

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const hasReadyThumbnails = (video: ParsedVideo) =>
  video.previewFrames.length > 1 || video.thumbUrls.length > 1

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

  const updateThumbUseCase = resolveDependency<UpdateVideoThumbnailsUseCase>(
    inject(UPDATE_THUMB_USE_CASE_KEY),
    'UpdateVideoThumbnailsUseCase',
  )

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
  const thumbnailJobPromises = new Map<string, Promise<void>>()
  const thumbnailJobResolvers = new Map<string, () => void>()
  const thumbnailJobDiagnostics = reactive(
    new Map<string, ThumbnailJobDiagnostic>(),
  )
  const thumbnailJobAbortControllers = new Map<string, AbortController>()
  const thumbnailJobsInterruptedForIngestion = new Set<string>()

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
  const isThumbnailDrainPaused = computed(
    () =>
      activeIngestionSessionId.value !== null || queuedIngestionCount.value > 0,
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

  const interruptActiveThumbnailJobsForIngestion = () => {
    thumbnailJobAbortControllers.forEach((controller, videoId) => {
      if (controller.signal.aborted) {
        return
      }

      thumbnailJobsInterruptedForIngestion.add(videoId)
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
    thumbnailJobsInterruptedForIngestion.delete(videoId)
    thumbnailJobAbortControllers.delete(videoId)
    controller?.abort()

    removeQueuedThumbnailJob(videoId)
    const sessionIds = removeTrackedIngestionThumbnailVideo(videoId)
    thumbnailJobState.delete(videoId)
    thumbnailJobDiagnostics.delete(videoId)
    settleThumbnailJob(videoId)
    refreshThumbnailSessions(sessionIds)
  }

  const startNextQueuedIngestion = () => {
    if (
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
          deferredThumbnailQueue.push(item.video)
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

  const getNextThumbnailConcurrency = () => {
    const nextVideoId = thumbnailPriorityQueue[0] ?? thumbnailQueue[0]
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

    while (activeThumbnailJobs.value < getNextThumbnailConcurrency()) {
      const nextVideoId =
        thumbnailPriorityQueue.shift() ?? thumbnailQueue.shift()

      if (!nextVideoId) {
        break
      }

      const sessionIds = getThumbnailSessionIds(nextVideoId)

      const video = toRaw(videoMap.get(nextVideoId))
      if (!video) {
        clearThumbnailTracking(nextVideoId)
        continue
      }

      if (hasReadyThumbnails(video)) {
        thumbnailJobState.set(nextVideoId, 'ready')
        settleThumbnailJob(nextVideoId)
        refreshThumbnailSessions(sessionIds)
        continue
      }

      if (thumbnailJobState.get(nextVideoId) !== 'queued') {
        continue
      }

      const abortController = new AbortController()
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
        state: 'processing',
        stage: 'loading',
        startedAtMs,
        completedFrames: 0,
        totalFrames: 0,
      })
      refreshThumbnailSessions(sessionIds)

      void updateThumbUseCase
        .execute(video, {
          signal: abortController.signal,
          onTiming: (timing) => {
            if (acceptingTimings) {
              measurementSessions.forEach((session) =>
                recordPhaseTiming(session.previewMeasurements, timing),
              )
            }
          },
          onProgress: (progress) => {
            if (
              thumbnailJobAbortControllers.get(nextVideoId) !== abortController
            ) {
              return
            }

            const currentDiagnostic = thumbnailJobDiagnostics.get(nextVideoId)
            thumbnailJobDiagnostics.set(nextVideoId, {
              ...currentDiagnostic,
              state: 'processing',
              startedAtMs,
              ...progress,
            })
          },
        })
        .then((updated) => {
          acceptingTimings = false
          if (abortController.signal.aborted) attemptOutcome = 'aborted'
          thumbnailJobsInterruptedForIngestion.delete(nextVideoId)
          const currentVideo = toRaw(videoMap.get(nextVideoId))
          if (!currentVideo) {
            clearThumbnailTracking(nextVideoId)
            return
          }

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
              totalFrames: completedFrames,
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
            totalFrames: updated.previewFrames.length,
            error: 'Preview generation returned fewer than two frames',
          })
        })
        .catch((error) => {
          acceptingTimings = false
          if (abortController.signal.aborted && isAbortError(error)) {
            attemptOutcome = 'aborted'
            const shouldRequeue =
              thumbnailJobsInterruptedForIngestion.delete(nextVideoId) &&
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

          thumbnailJobsInterruptedForIngestion.delete(nextVideoId)
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
          measurementSessions.forEach((session) => {
            session.previewAttempts[attemptOutcome] += 1
          })
          if (
            thumbnailJobAbortControllers.get(nextVideoId) === abortController
          ) {
            thumbnailJobAbortControllers.delete(nextVideoId)
          }
          activeThumbnailJobs.value = Math.max(activeThumbnailJobs.value - 1, 0)
          if (shouldSettleJob) {
            settleThumbnailJob(nextVideoId)
          }
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
    const video = toRaw(videoMap.get(videoId))
    if (!video) {
      return Promise.resolve()
    }

    if (hasReadyThumbnails(video)) {
      if (thumbnailJobState.has(videoId)) {
        thumbnailJobState.set(videoId, 'ready')
      }
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

  function addVideos(videos: ParsedVideo[]) {
    videos.forEach((video) => {
      const existing = toRaw(videoMap.get(video.id))
      if (existing) {
        return
      }

      videoMap.set(video.id, video)
    })
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

      interruptActiveThumbnailJobsForIngestion()
      startNextQueuedIngestion()
    })
  }

  async function updateVideoThumbnails(id: string) {
    await queueThumbnailJob(id, true)
  }

  function requestThumbnailWarmup(id: string) {
    void queueThumbnailJob(id, true)
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
        backend: 'dom' as const,
        workersEnabled: false,
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
    updateVotes,
  }
})
