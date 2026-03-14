import type { ParsedVideo } from '@domain/entities'
import { defineStore } from 'pinia'
import { computed, inject, reactive, ref, toRaw } from 'vue'
import type {
  FilterVideosUseCase,
  VideoIngestionProgress,
  UpdateVideoThumbnailsUseCase,
  UpdateVideoVotesUseCase,
  VideoIngestionUseCase,
} from '@app/usecases'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import { isBrowserPlayableVideoFile } from '@/shared/video/browserPlayableVideoTypes'
import type { VideoImportItem } from '@domain/valueObjects'
import {
  ADD_VIDEOS_USE_CASE_KEY,
  FILTER_VIDEOS_USE_CASE_KEY,
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
type IngestionSessionStatus =
  | 'queued'
  | 'ingesting'
  | 'thumbnailing'
  | 'completed'
  | 'failed'

type IngestionSession = {
  id: string
  items: VideoImportItem[]
  status: IngestionSessionStatus
  progress: VideoIngestionProgress | null
  startedAtMs: number | null
  completedAtMs: number | null
  thumbnailVideoIds: string[]
}

type QueuedIngestionRequest = {
  sessionId: string
  resolve: () => void
  reject: (reason?: unknown) => void
}

const THUMBNAIL_BACKGROUND_DELAY_MS = 150
const DEFAULT_THUMBNAIL_CONCURRENCY = 4

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const hasReadyThumbnails = (video: ParsedVideo) => video.thumbUrls.length > 1

export const useVideoStore = defineStore('videos', () => {
  const addVideosUseCase = resolveDependency<VideoIngestionUseCase>(
    inject(ADD_VIDEOS_USE_CASE_KEY),
    'AddVideosUseCase',
  )

  const filterVideosUseCase = resolveDependency<FilterVideosUseCase>(
    inject(FILTER_VIDEOS_USE_CASE_KEY),
    'FilterVideosUseCase',
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
  const minDuration = ref(0)
  const maxDuration = ref(0)
  const searchQuery = ref('')
  const ingestionSessions = reactive(new Map<string, IngestionSession>())
  const queuedIngestionRequests = reactive<QueuedIngestionRequest[]>([])
  const activeIngestionSessionId = ref<string | null>(null)
  const displayedSessionId = ref<string | null>(null)
  const ingestionProgress = ref<VideoIngestionProgress | null>(null)
  const ingestionStartedAtMs = ref<number | null>(null)
  const ingestionCompletedAtMs = ref<number | null>(null)
  const thumbnailConcurrencyOverride = ref<number | null>(null)
  const activeThumbnailJobs = ref(0)
  const ingestionThumbnailVideoIds = reactive<string[]>([])
  const thumbnailJobState = reactive(new Map<string, ThumbnailJobState>())
  const thumbnailVideoSessionIds = reactive(new Map<string, string>())
  const thumbnailQueue = reactive<string[]>([])
  const thumbnailPriorityQueue = reactive<string[]>([])
  const thumbnailJobPromises = new Map<string, Promise<void>>()
  const thumbnailJobResolvers = new Map<string, () => void>()
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

  const getDisplayedSessionThumbnailIds = () =>
    getSession(displayedSessionId.value)?.thumbnailVideoIds ?? []

  const createQueuedIngestionSession = (items: VideoImportItem[]) => {
    const sessionId = `ingestion-${nextIngestionSessionId}`
    nextIngestionSessionId += 1

    ingestionSessions.set(sessionId, {
      id: sessionId,
      items,
      status: 'queued',
      progress: null,
      startedAtMs: null,
      completedAtMs: null,
      thumbnailVideoIds: [],
    })

    return sessionId
  }

  const sortByVotes = computed<ParsedVideo[]>(() =>
    Array.from(videoMap.values()).sort(
      (a, b) => Number(b.votes) - Number(a.votes),
    ),
  )

  const sortByPinned = computed<ParsedVideo[]>(() =>
    [...sortByVotes.value].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
  )

  const filteredVideos = computed<ParsedVideo[]>(() => {
    const minDurationFilter =
      minDuration.value > 0 ? minDuration.value * 60 : undefined
    const maxDurationFilter =
      maxDuration.value > 0 ? maxDuration.value * 60 : undefined
    const normalizedSearchQuery = searchQuery.value.trim() || undefined

    return filterVideosUseCase.execute({
      videos: sortByPinned.value,
      options: {
        minDurationSeconds: minDurationFilter,
        maxDurationSeconds: maxDurationFilter,
        searchQuery: normalizedSearchQuery,
      },
    })
  })

  const autoThumbnailConcurrency = computed(() => {
    if (
      typeof navigator === 'undefined' ||
      !Number.isFinite(navigator.hardwareConcurrency)
    ) {
      return 2
    }

    return clamp(
      Math.floor(navigator.hardwareConcurrency / 2),
      1,
      DEFAULT_THUMBNAIL_CONCURRENCY,
    )
  })

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

  const thumbnailGenerationProgress = computed(() => {
    let generatedCount = 0
    let queuedCount = 0
    let processingCount = 0
    let failedCount = 0

    getDisplayedSessionThumbnailIds().forEach((videoId) => {
      const state = thumbnailJobState.get(videoId)

      if (state === 'ready') {
        generatedCount += 1
      } else if (state === 'queued') {
        queuedCount += 1
      } else if (state === 'processing') {
        processingCount += 1
      } else if (state === 'failed') {
        failedCount += 1
      }
    })

    const total = getDisplayedSessionThumbnailIds().length
    const pendingCount = queuedCount + processingCount

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

  const isIngesting = computed(() =>
    Boolean(
      activeIngestionSessionId.value !== null ||
        (ingestionProgress.value &&
          ingestionProgress.value.completedCount < ingestionProgress.value.total),
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
    const sessionId = thumbnailVideoSessionIds.get(videoId)
    if (!sessionId) {
      return
    }

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

    thumbnailVideoSessionIds.delete(videoId)
  }

  const trackIngestionThumbnailVideo = (sessionId: string, videoId: string) => {
    const session = ingestionSessions.get(sessionId)
    if (!session || session.thumbnailVideoIds.includes(videoId)) {
      return
    }

    session.thumbnailVideoIds.push(videoId)
    thumbnailVideoSessionIds.set(videoId, sessionId)

    if (displayedSessionId.value === sessionId) {
      syncDisplayedSession(sessionId)
    }
  }

  const clearThumbnailTracking = (videoId: string) => {
    removeQueuedThumbnailJob(videoId)
    removeTrackedIngestionThumbnailVideo(videoId)
    thumbnailJobState.delete(videoId)
    settleThumbnailJob(videoId)
  }

  const startNextQueuedIngestion = () => {
    if (activeIngestionSessionId.value !== null || activeThumbnailJobs.value > 0) {
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

    try {
      for await (const item of addVideosUseCase.execute(session.items)) {
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
      session.completedAtMs = Date.now()
      activeIngestionSessionId.value = null
      syncDisplayedSession(session.id)

      if (queuedIngestionRequests.length > 0) {
        startNextQueuedIngestion()
      } else {
        scheduleThumbnailPump()
      }
    }
  }

  const pumpThumbnailQueue = () => {
    clearThumbnailPumpTimer()

    if (isThumbnailDrainPaused.value) {
      return
    }

    while (activeThumbnailJobs.value < effectiveThumbnailConcurrency.value) {
      const nextVideoId =
        thumbnailPriorityQueue.shift() ?? thumbnailQueue.shift()

      if (!nextVideoId) {
        break
      }

      const sessionId = thumbnailVideoSessionIds.get(nextVideoId) ?? null
      const session = getSession(sessionId)

      const video = toRaw(videoMap.get(nextVideoId))
      if (!video) {
        clearThumbnailTracking(nextVideoId)
        continue
      }

      if (hasReadyThumbnails(video)) {
        thumbnailJobState.set(nextVideoId, 'ready')
        settleThumbnailJob(nextVideoId)
        continue
      }

      if (thumbnailJobState.get(nextVideoId) !== 'queued') {
        continue
      }

      activeThumbnailJobs.value += 1
      thumbnailJobState.set(nextVideoId, 'processing')
      if (session) {
        session.status = 'thumbnailing'
        syncDisplayedSession(session.id)
      }

      void updateThumbUseCase
        .execute(video)
        .then((updated) => {
          if (!videoMap.has(nextVideoId)) {
            clearThumbnailTracking(nextVideoId)
            return
          }

          if (hasReadyThumbnails(updated)) {
            videoMap.set(nextVideoId, updated)
            thumbnailJobState.set(nextVideoId, 'ready')
            return
          }

          thumbnailJobState.set(nextVideoId, 'failed')
        })
        .catch((error) => {
          if (!videoMap.has(nextVideoId)) {
            clearThumbnailTracking(nextVideoId)
            return
          }

          thumbnailJobState.set(nextVideoId, 'failed')
          logger.error('Failed to update thumbnails', error)
        })
        .finally(() => {
          activeThumbnailJobs.value = Math.max(activeThumbnailJobs.value - 1, 0)
          settleThumbnailJob(nextVideoId)
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

  const queueBackgroundThumbnailJob = (video: ParsedVideo, sessionId: string) => {
    if (hasReadyThumbnails(video)) {
      return
    }

    trackIngestionThumbnailVideo(sessionId, video.id)
    void queueThumbnailJob(video.id)
  }

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
    const pinnedVideos = Array.from(videoMap.entries()).filter(
      ([, video]) => video.pinned,
    )

    Array.from(videoMap.values())
      .filter((video) => !video.pinned)
      .forEach((video) => {
        releaseVideoResources(video.id)
        clearThumbnailTracking(video.id)
      })

    videoMap.clear()

    pinnedVideos.forEach(([id, video]) => {
      videoMap.set(id, video)
    })
  }

  async function updateVotes(videoId: string, delta: number) {
    const video = videoMap.get(videoId)
    if (!video) {
      return
    }

    try {
      const votes = await updateVotesUseCase.execute(videoId, delta)
      if (votes != null) {
        video.votes = votes
      }
    } catch (error) {
      logger.error('Failed to update votes', error)
    }
  }

  async function addVideosFromFiles(files: FileList) {
    const items: VideoImportItem[] = Array.from(files)
      .filter(isBrowserPlayableVideoFile)
      .map((file) => ({ file }))

    if (!items.length) {
      return
    }

    const sessionId = createQueuedIngestionSession(items)
    clearThumbnailPumpTimer()

    return await new Promise<void>((resolve, reject) => {
      queuedIngestionRequests.push({
        sessionId,
        resolve,
        reject,
      })

      startNextQueuedIngestion()
    })
  }

  async function updateVideoThumbnails(id: string) {
    await queueThumbnailJob(id, true)
  }

  function requestThumbnailWarmup(id: string) {
    void queueThumbnailJob(id, true)
  }

  function setMinDuration(value: number) {
    minDuration.value = value >= 0 ? value : 0
  }

  function setMaxDuration(value: number) {
    maxDuration.value = value >= 0 ? value : 0
  }

  function setSearchQuery(value: string) {
    searchQuery.value = value
  }

  function setThumbnailConcurrencyOverride(value: number | null) {
    if (value == null) {
      thumbnailConcurrencyOverride.value = null
    } else {
      thumbnailConcurrencyOverride.value = clamp(
        value,
        1,
        DEFAULT_THUMBNAIL_CONCURRENCY,
      )
    }

    startNextQueuedIngestion()
    pumpThumbnailQueue()
  }

  function getThumbnailJobState(videoId: string) {
    return thumbnailJobState.get(videoId)
  }

  return {
    minDuration,
    maxDuration,
    searchQuery,
    ingestionProgress,
    ingestionStartedAtMs,
    ingestionCompletedAtMs,
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
    filteredVideos,
    sortByPinned,
    sortByVotes,
    addVideos,
    addVideosFromFiles,
    removeVideo,
    removeAllUnpinned,
    setMinDuration,
    setMaxDuration,
    setSearchQuery,
    setThumbnailConcurrencyOverride,
    getThumbnailJobState,
    togglePinVideo,
    requestThumbnailWarmup,
    updateVideoThumbnails,
    updateVotes,
  }
})
