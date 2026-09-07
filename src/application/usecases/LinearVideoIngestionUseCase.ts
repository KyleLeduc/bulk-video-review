import type { ParsedVideo } from '@domain/entities'
import type { IVideoPreviewCacheRepository } from '@domain/repositories/IVideoPreviewCacheRepository'
import {
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  hasCompleteMotionFallback,
} from '@domain/services/videoPreviewPolicy'
import { measureVideoProcessing } from '@app/services/videoProcessingTiming'
import type { VideoProcessingTimingObserver } from '@app/ports/VideoProcessingTiming'
import type { VideoImportItem } from '@domain/valueObjects'
import type {
  IVideoAggregateRepository,
  IVideoPreviewRepository,
} from '@domain/repositories'
import type {
  IVideoIngestionFailureTracker,
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
} from '@app/ports'
import type {
  VideoIngestionEvent,
  VideoIngestionOptions,
  VideoIngestionProgress,
  VideoIngestionUseCase,
} from './VideoIngestionUseCase'

type PendingVideoItem = {
  id: string
  item: VideoImportItem
  index: number
}

type ProcessResult =
  | { status: 'created'; video: ParsedVideo }
  | { status: 'skipped' }
  | { status: 'failed' }

type IdentificationResult =
  | { status: 'identified'; pending: PendingVideoItem }
  | { status: 'failed' }

type ClassificationResult =
  | { status: 'cached'; video: ParsedVideo }
  | { status: 'fresh'; pending: PendingVideoItem }
  | { status: 'deferred'; pending: PendingVideoItem }
  | { status: 'failed' }

type PoolOutcome<TResult> =
  | { status: 'fulfilled'; value: TResult }
  | { status: 'rejected'; reason: unknown }

type PoolCompletion<TResult> = {
  inputIndex: number
  outcome: PoolOutcome<TResult>
  activeItemCount: number
  pendingItemCount: number
  peakActiveItemCount: number
  peakPendingItemCount: number
}

const DEFAULT_INGESTION_CONCURRENCY = 2
const MAX_INGESTION_CONCURRENCY = 4

const normalizeConcurrency = (requested?: number): number => {
  if (!Number.isFinite(requested)) {
    return DEFAULT_INGESTION_CONCURRENCY
  }

  return Math.min(
    Math.max(Math.trunc(requested ?? DEFAULT_INGESTION_CONCURRENCY), 1),
    MAX_INGESTION_CONCURRENCY,
  )
}

export class LinearVideoIngestionUseCase implements VideoIngestionUseCase {
  constructor(
    private readonly metadataExtractor: IVideoMetadataExtractor,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly logger: ILogger,
    private readonly failureTracker: IVideoIngestionFailureTracker,
    private readonly previewRepository?: IVideoPreviewRepository,
    private readonly previewCache?: IVideoPreviewCacheRepository,
  ) {}

  async *execute(
    items: VideoImportItem[],
    options?: VideoIngestionOptions,
  ): AsyncGenerator<VideoIngestionEvent> {
    const timingFor = (
      videoId: string,
    ): VideoProcessingTimingObserver | undefined => {
      const observer = options?.onTiming
      return observer ? (timing) => observer({ ...timing, videoId }) : undefined
    }
    const startedAt = performance.now()
    const elapsedMs = () => Number((performance.now() - startedAt).toFixed(2))
    const effectiveConcurrency = normalizeConcurrency(options?.concurrency)
    const initialActiveItemCount = Math.min(items.length, effectiveConcurrency)
    const initialPendingItemCount = Math.max(
      items.length - initialActiveItemCount,
      0,
    )
    const progress: VideoIngestionProgress = {
      total: items.length,
      scanned: 0,
      existingCount: 0,
      newCount: 0,
      knownErrorCount: 0,
      createdCount: 0,
      failedCount: 0,
      completedCount: 0,
      phase: 'identifying',
      effectiveConcurrency,
      activeItemCount: initialActiveItemCount,
      pendingItemCount: initialPendingItemCount,
      phaseCompletedCount: 0,
      phaseTotal: items.length,
      peakActiveItemCount: initialActiveItemCount,
      peakPendingItemCount: initialPendingItemCount,
      inputBytes: items.reduce((total, item) => total + item.file.size, 0),
      elapsedMs: 0,
      skippedCount: 0,
      duplicateCount: 0,
    }

    this.logger.info('[linear-ingestion] execute:start', {
      totalItems: items.length,
      effectiveConcurrency,
    })

    yield { type: 'progress', progress: { ...progress } }

    const identificationStartedAt = performance.now()
    const identifiedItems: PendingVideoItem[] = []
    let identificationCompletedCount = 0

    for await (const completion of this.runBounded(
      items,
      effectiveConcurrency,
      (item, index) => this.identifyItem(item, index, items.length),
    )) {
      identificationCompletedCount += 1

      if (completion.outcome.status === 'fulfilled') {
        const result = completion.outcome.value
        if (result.status === 'identified') {
          identifiedItems.push(result.pending)
        } else {
          progress.failedCount += 1
          progress.completedCount += 1
        }
      } else {
        progress.failedCount += 1
        progress.completedCount += 1
        const failedItem = items[completion.inputIndex]
        this.logger.error('[linear-ingestion] identify:pool-task:failed', {
          ...(failedItem
            ? this.createContext(
                failedItem.file,
                completion.inputIndex + 1,
                items.length,
              )
            : {}),
          error: completion.outcome.reason,
        })
      }

      progress.phaseCompletedCount = identificationCompletedCount
      progress.activeItemCount = completion.activeItemCount
      progress.pendingItemCount = completion.pendingItemCount
      progress.peakActiveItemCount = Math.max(
        progress.peakActiveItemCount ?? 0,
        completion.peakActiveItemCount,
      )
      progress.peakPendingItemCount = Math.max(
        progress.peakPendingItemCount ?? 0,
        completion.peakPendingItemCount,
      )
      progress.elapsedMs = elapsedMs()
      yield { type: 'progress', progress: { ...progress } }
    }

    identifiedItems.sort((left, right) => left.index - right.index)
    const uniqueItems: PendingVideoItem[] = []
    const seenIds = new Set<string>()
    for (const pending of identifiedItems) {
      if (seenIds.has(pending.id)) {
        progress.duplicateCount = (progress.duplicateCount ?? 0) + 1
        progress.completedCount += 1
        continue
      }

      seenIds.add(pending.id)
      uniqueItems.push(pending)
    }

    progress.identificationElapsedMs = Number(
      (performance.now() - identificationStartedAt).toFixed(2),
    )
    progress.scanned = progress.failedCount + (progress.duplicateCount ?? 0)
    progress.phase = 'classifying'
    progress.phaseCompletedCount = 0
    progress.phaseTotal = uniqueItems.length
    progress.activeItemCount = Math.min(
      uniqueItems.length,
      effectiveConcurrency,
    )
    progress.pendingItemCount = Math.max(
      uniqueItems.length - progress.activeItemCount,
      0,
    )
    progress.peakActiveItemCount = Math.max(
      progress.peakActiveItemCount ?? 0,
      progress.activeItemCount,
    )
    progress.peakPendingItemCount = Math.max(
      progress.peakPendingItemCount ?? 0,
      progress.pendingItemCount,
    )
    progress.elapsedMs = elapsedMs()
    yield { type: 'progress', progress: { ...progress } }

    const classificationStartedAt = performance.now()
    const freshItems: PendingVideoItem[] = []
    const deferredItems: PendingVideoItem[] = []
    let classificationCompletedCount = 0

    for await (const completion of this.runBounded(
      uniqueItems,
      effectiveConcurrency,
      (pending) =>
        this.classifyItem(pending, items.length, timingFor(pending.id)),
    )) {
      classificationCompletedCount += 1
      progress.scanned += 1
      let cachedVideo: ParsedVideo | undefined

      if (completion.outcome.status === 'fulfilled') {
        const result = completion.outcome.value
        switch (result.status) {
          case 'cached':
            progress.existingCount += 1
            progress.completedCount += 1
            cachedVideo = result.video
            break
          case 'fresh':
            progress.newCount += 1
            freshItems.push(result.pending)
            break
          case 'deferred':
            progress.knownErrorCount += 1
            deferredItems.push(result.pending)
            break
          case 'failed':
            progress.failedCount += 1
            progress.completedCount += 1
            break
        }
      } else {
        progress.failedCount += 1
        progress.completedCount += 1
        const failedItem = uniqueItems[completion.inputIndex]
        this.logger.error('[linear-ingestion] classify:pool-task:failed', {
          ...(failedItem
            ? this.createContext(
                failedItem.item.file,
                failedItem.index + 1,
                items.length,
              )
            : {}),
          error: completion.outcome.reason,
        })
      }

      progress.phaseCompletedCount = classificationCompletedCount
      progress.activeItemCount = completion.activeItemCount
      progress.pendingItemCount = completion.pendingItemCount
      progress.peakActiveItemCount = Math.max(
        progress.peakActiveItemCount ?? 0,
        completion.peakActiveItemCount,
      )
      progress.peakPendingItemCount = Math.max(
        progress.peakPendingItemCount ?? 0,
        completion.peakPendingItemCount,
      )
      progress.elapsedMs = elapsedMs()

      if (cachedVideo) {
        yield { type: 'video', video: cachedVideo }
      }
      yield { type: 'progress', progress: { ...progress } }
    }

    freshItems.sort((left, right) => left.index - right.index)
    deferredItems.sort((left, right) => left.index - right.index)
    progress.classificationElapsedMs = Number(
      (performance.now() - classificationStartedAt).toFixed(2),
    )
    progress.activeItemCount = 0
    progress.pendingItemCount = freshItems.length + deferredItems.length
    progress.peakPendingItemCount = Math.max(
      progress.peakPendingItemCount ?? 0,
      progress.pendingItemCount,
    )
    progress.elapsedMs = elapsedMs()
    yield { type: 'progress', progress: { ...progress } }

    let createdCount = 0
    let skippedCount = 0
    let processingStartedAt: number | null = null
    const processingElapsedMs = () =>
      processingStartedAt == null
        ? 0
        : Number((performance.now() - processingStartedAt).toFixed(2))
    const lanes = [
      { phase: 'ingesting-fresh' as const, items: freshItems },
      { phase: 'ingesting-retries' as const, items: deferredItems },
    ]

    for (const [laneIndex, lane] of lanes.entries()) {
      if (lane.items.length === 0) {
        continue
      }

      const futurePendingCount = lanes
        .slice(laneIndex + 1)
        .reduce((total, futureLane) => total + futureLane.items.length, 0)
      let phaseCompletedCount = 0
      progress.phase = lane.phase
      progress.phaseCompletedCount = 0
      progress.phaseTotal = lane.items.length
      progress.activeItemCount = Math.min(
        lane.items.length,
        effectiveConcurrency,
      )
      progress.pendingItemCount =
        lane.items.length - progress.activeItemCount + futurePendingCount
      progress.peakActiveItemCount = Math.max(
        progress.peakActiveItemCount ?? 0,
        progress.activeItemCount,
      )
      progress.peakPendingItemCount = Math.max(
        progress.peakPendingItemCount ?? 0,
        progress.pendingItemCount,
      )
      progress.elapsedMs = elapsedMs()
      yield { type: 'progress', progress: { ...progress } }

      processingStartedAt ??= performance.now()
      for await (const completion of this.runBounded(
        lane.items,
        effectiveConcurrency,
        (pending) =>
          this.processItem(pending, items.length, timingFor(pending.id)),
      )) {
        phaseCompletedCount += 1
        let createdVideo: ParsedVideo | undefined

        if (completion.outcome.status === 'fulfilled') {
          const result = completion.outcome.value
          switch (result.status) {
            case 'created':
              createdCount += 1
              createdVideo = result.video
              break
            case 'skipped':
              skippedCount += 1
              break
            case 'failed':
              progress.failedCount += 1
              break
          }
        } else {
          progress.failedCount += 1
          const failedItem = lane.items[completion.inputIndex]
          this.logger.error('[linear-ingestion] process:pool-task:failed', {
            ...(failedItem
              ? this.createContext(
                  failedItem.item.file,
                  failedItem.index + 1,
                  items.length,
                )
              : {}),
            error: completion.outcome.reason,
          })
        }

        progress.createdCount = createdCount
        progress.skippedCount = skippedCount
        progress.completedCount =
          progress.existingCount +
          createdCount +
          skippedCount +
          progress.failedCount +
          (progress.duplicateCount ?? 0)
        progress.phaseCompletedCount = phaseCompletedCount
        progress.activeItemCount = completion.activeItemCount
        progress.pendingItemCount =
          completion.pendingItemCount + futurePendingCount
        progress.peakActiveItemCount = Math.max(
          progress.peakActiveItemCount ?? 0,
          completion.peakActiveItemCount,
        )
        progress.peakPendingItemCount = Math.max(
          progress.peakPendingItemCount ?? 0,
          completion.peakPendingItemCount + futurePendingCount,
        )
        progress.processingElapsedMs = processingElapsedMs()
        progress.elapsedMs = elapsedMs()

        if (createdVideo) {
          yield { type: 'video', video: createdVideo }
        }
        yield { type: 'progress', progress: { ...progress } }
      }
    }

    progress.phase = 'complete'
    progress.activeItemCount = 0
    progress.pendingItemCount = 0
    progress.phaseCompletedCount = items.length
    progress.phaseTotal = items.length
    progress.completedCount =
      progress.existingCount +
      createdCount +
      skippedCount +
      progress.failedCount +
      (progress.duplicateCount ?? 0)
    progress.processingElapsedMs = processingElapsedMs()
    progress.elapsedMs = elapsedMs()
    yield { type: 'progress', progress: { ...progress } }

    this.logger.info('[linear-ingestion] execute:complete', {
      totalItems: items.length,
      cachedCount: progress.existingCount,
      createdCount,
      skippedCount,
      failedCount: progress.failedCount,
      duplicateCount: progress.duplicateCount,
      deferredRetryCount: deferredItems.length,
      effectiveConcurrency,
      identificationElapsedMs: progress.identificationElapsedMs,
      classificationElapsedMs: progress.classificationElapsedMs,
      processingElapsedMs: progress.processingElapsedMs,
      elapsedMs: progress.elapsedMs,
    })
  }

  private async identifyItem(
    item: VideoImportItem,
    index: number,
    total: number,
  ): Promise<IdentificationResult> {
    const context = this.createContext(item.file, index + 1, total)

    try {
      const id = await this.metadataExtractor.generateId(item.file)
      return { status: 'identified', pending: { id, item, index } }
    } catch (error) {
      this.logger.error('[linear-ingestion] identify:item:failed', {
        ...context,
        error,
      })
      return { status: 'failed' }
    }
  }

  private async classifyItem(
    pending: PendingVideoItem,
    total: number,
    onTiming?: VideoProcessingTimingObserver,
  ): Promise<ClassificationResult> {
    const { id, item, index } = pending
    const context = this.createContext(item.file, index + 1, total)

    try {
      const existing = await measureVideoProcessing(
        'persistence',
        () => this.aggregateRepository.getVideo(id),
        onTiming,
      )
      if (existing) {
        const parsedVideo = this.mapToParsed(existing)
        try {
          if (this.previewRepository) {
            const previews = this.previewRepository
            parsedVideo.previewFrames = await measureVideoProcessing(
              'persistence',
              () => previews.getFrames(id),
              onTiming,
            )
          }
        } catch (error) {
          this.logger.warn('[linear-ingestion] cached-preview:hydrate:failed', {
            ...context,
            id,
            error,
          })
        }

        if (this.previewCache) {
          try {
            const products = await this.previewCache.getProducts(
              id,
              parsedVideo.duration,
            )
            const hydrated = { ...parsedVideo, ...products }
            if (hasCompleteMotionFallback(hydrated)) {
              parsedVideo.motionFallback = products.motionFallback
            }
            if (hasCompleteMotionClips(hydrated)) {
              parsedVideo.motionClips = products.motionClips
              parsedVideo.previewVersions.motionClips =
                products.previewVersions.motionClips
            }
            if (hasCompleteKeyframes(hydrated)) {
              parsedVideo.keyframes = products.keyframes
              parsedVideo.previewVersions.keyframes =
                products.previewVersions.keyframes
            }
          } catch {
            this.logger.warn(
              '[linear-ingestion] preview-products:hydrate:failed',
              { id },
            )
          }
        }
        this.sessionRegistry.registerFile(id, item.file)
        return { status: 'cached', video: parsedVideo }
      }

      if (await this.hasRecordedFailure(id, onTiming)) {
        return { status: 'deferred', pending }
      }

      return { status: 'fresh', pending }
    } catch (error) {
      this.logger.error('[linear-ingestion] classify:item:failed', {
        ...context,
        id,
        error,
      })
      return { status: 'failed' }
    }
  }

  private async *runBounded<TItem, TResult>(
    items: readonly TItem[],
    concurrency: number,
    task: (item: TItem, index: number) => Promise<TResult>,
  ): AsyncGenerator<PoolCompletion<TResult>> {
    type SettledTask = Pick<PoolCompletion<TResult>, 'inputIndex' | 'outcome'>

    let nextInputIndex = 0
    let peakActiveItemCount = 0
    let peakPendingItemCount = 0
    const activeTasks = new Map<number, Promise<SettledTask>>()

    const startAvailableTasks = () => {
      while (nextInputIndex < items.length && activeTasks.size < concurrency) {
        const inputIndex = nextInputIndex
        const item = items[inputIndex] as TItem
        nextInputIndex += 1

        const settledTask: Promise<SettledTask> = Promise.resolve()
          .then(() => task(item, inputIndex))
          .then(
            (value) => ({
              inputIndex,
              outcome: { status: 'fulfilled' as const, value },
            }),
            (reason: unknown) => ({
              inputIndex,
              outcome: { status: 'rejected' as const, reason },
            }),
          )
        activeTasks.set(inputIndex, settledTask)
      }

      peakActiveItemCount = Math.max(peakActiveItemCount, activeTasks.size)
      peakPendingItemCount = Math.max(
        peakPendingItemCount,
        items.length - nextInputIndex,
      )
    }

    startAvailableTasks()
    while (activeTasks.size > 0) {
      const completion = await Promise.race(activeTasks.values())
      activeTasks.delete(completion.inputIndex)
      startAvailableTasks()

      yield {
        ...completion,
        activeItemCount: activeTasks.size,
        pendingItemCount: items.length - nextInputIndex,
        peakActiveItemCount,
        peakPendingItemCount,
      }
    }
  }

  private async processItem(
    pending: PendingVideoItem,
    total: number,
    onTiming?: VideoProcessingTimingObserver,
  ): Promise<ProcessResult> {
    const { item, id, index } = pending
    const context = {
      ...this.createContext(item.file, index + 1, total),
      id,
    }

    try {
      const extractionResult = await this.metadataExtractor.extract(item.file, {
        idHint: id,
        ...(onTiming ? { onTiming } : {}),
      })
      if (!extractionResult) {
        await this.recordFailure(id, onTiming)
        this.logger.warn('[linear-ingestion] item:skipped', {
          ...context,
          reason: 'unplayable-or-invalid',
        })
        return { status: 'skipped' }
      }

      const persisted = await measureVideoProcessing(
        'persistence',
        () => this.aggregateRepository.postVideo(extractionResult.videoEntity),
        onTiming,
      )

      this.sessionRegistry.registerFile(id, item.file)
      await this.clearFailure(id, onTiming)

      return { status: 'created', video: this.mapToParsed(persisted) }
    } catch (error) {
      await this.recordFailure(id, onTiming)
      this.logger.error('[linear-ingestion] item:failed', {
        ...context,
        error,
      })
      return { status: 'failed' }
    }
  }

  private async hasRecordedFailure(
    videoId: string,
    onTiming?: VideoProcessingTimingObserver,
  ): Promise<boolean> {
    try {
      return await measureVideoProcessing(
        'persistence',
        () => this.failureTracker.hasFailure(videoId),
        onTiming,
      )
    } catch (error) {
      this.logger.error('[linear-ingestion] failure-state:lookup-failed', {
        videoId,
        error,
      })
      return false
    }
  }

  private async recordFailure(
    videoId: string,
    onTiming?: VideoProcessingTimingObserver,
  ): Promise<void> {
    try {
      await measureVideoProcessing(
        'persistence',
        () => this.failureTracker.recordFailure(videoId),
        onTiming,
      )
    } catch (error) {
      this.logger.error('[linear-ingestion] failure-state:record-failed', {
        videoId,
        error,
      })
    }
  }

  private async clearFailure(
    videoId: string,
    onTiming?: VideoProcessingTimingObserver,
  ): Promise<void> {
    try {
      await measureVideoProcessing(
        'persistence',
        () => this.failureTracker.clearFailure(videoId),
        onTiming,
      )
    } catch (error) {
      this.logger.error('[linear-ingestion] failure-state:clear-failed', {
        videoId,
        error,
      })
    }
  }

  private mapToParsed(aggregate: {
    id: string
    title: string
    thumb: string
    duration: number
    thumbUrls: string[]
    tags: string[]
    votes: number
  }): ParsedVideo {
    return {
      ...aggregate,
      url: '',
      pinned: false,
      previewFrames: [],
      motionClips: [],
      keyframes: [],
      previewVersions: {},
    }
  }

  private createContext(file: File, index: number, total: number) {
    return {
      queueIndex: index,
      queueLength: total,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileType: file.type || 'unknown',
    }
  }
}

export interface LinearVideoIngestionUseCaseDeps {
  metadataExtractor: IVideoMetadataExtractor
  aggregateRepository: IVideoAggregateRepository
  sessionRegistry: IVideoSessionRegistry
  logger: ILogger
  failureTracker: IVideoIngestionFailureTracker
  previewRepository: IVideoPreviewRepository
  previewCache?: IVideoPreviewCacheRepository
}

export function createLinearVideoIngestionUseCase({
  metadataExtractor,
  aggregateRepository,
  sessionRegistry,
  logger,
  failureTracker,
  previewRepository,
  previewCache,
}: LinearVideoIngestionUseCaseDeps): LinearVideoIngestionUseCase {
  return new LinearVideoIngestionUseCase(
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    logger,
    failureTracker,
    previewRepository,
    previewCache,
  )
}
