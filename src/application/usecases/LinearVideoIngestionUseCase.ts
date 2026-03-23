import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  IVideoIngestionFailureTracker,
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
} from '@app/ports'
import type {
  VideoIngestionEvent,
  VideoIngestionProgress,
  VideoIngestionUseCase,
} from './VideoIngestionUseCase'

type PendingVideoItem = {
  id: string
  item: VideoImportItem
}

type ProcessResult =
  | { status: 'created'; video: ParsedVideo }
  | { status: 'skipped' }
  | { status: 'failed' }

export class LinearVideoIngestionUseCase implements VideoIngestionUseCase {
  constructor(
    private readonly metadataExtractor: IVideoMetadataExtractor,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly logger: ILogger,
    private readonly failureTracker: IVideoIngestionFailureTracker,
  ) {}

  async *execute(
    items: VideoImportItem[],
  ): AsyncGenerator<VideoIngestionEvent> {
    this.logger.info('[linear-ingestion] execute:start', {
      totalItems: items.length,
    })

    const { cachedVideos, freshItems, deferredItems, partitionFailures } =
      await this.partitionItems(items)

    let createdCount = 0
    let skippedCount = 0
    let failedCount = partitionFailures

    const progress: VideoIngestionProgress = {
      total: items.length,
      scanned: items.length,
      existingCount: cachedVideos.length,
      newCount: freshItems.length,
      knownErrorCount: deferredItems.length,
      createdCount,
      failedCount,
      completedCount: cachedVideos.length + partitionFailures,
    }

    yield {
      type: 'progress',
      progress: { ...progress },
    }

    for (const video of cachedVideos) {
      yield {
        type: 'video',
        video,
      }
    }

    for (const item of [...freshItems, ...deferredItems]) {
      const result = await this.processItem(item)

      switch (result.status) {
        case 'created':
          createdCount += 1
          progress.createdCount = createdCount
          yield {
            type: 'video',
            video: result.video,
          }
          break
        case 'skipped':
          skippedCount += 1
          break
        case 'failed':
          failedCount += 1
          break
      }

      progress.failedCount = skippedCount + failedCount
      progress.completedCount =
        cachedVideos.length + createdCount + skippedCount + failedCount

      yield {
        type: 'progress',
        progress: { ...progress },
      }
    }

    this.logger.info('[linear-ingestion] execute:complete', {
      totalItems: items.length,
      cachedCount: cachedVideos.length,
      createdCount,
      skippedCount,
      failedCount,
      deferredRetryCount: deferredItems.length,
    })
  }

  private async partitionItems(items: VideoImportItem[]) {
    const cachedVideos: ParsedVideo[] = []
    const freshItems: PendingVideoItem[] = []
    const deferredItems: PendingVideoItem[] = []
    let partitionFailures = 0

    for (const [index, item] of items.entries()) {
      const context = this.createContext(item.file, index + 1, items.length)

      try {
        const id = await this.metadataExtractor.generateId(item.file)
        const existing = await this.aggregateRepository.getVideo(id)

        if (existing) {
          this.sessionRegistry.registerFile(id, item.file)
          cachedVideos.push(this.mapToParsed(existing))
          continue
        }

        const pendingItem = { id, item }
        const hasFailure = await this.hasRecordedFailure(id)

        if (hasFailure) {
          deferredItems.push(pendingItem)
          continue
        }

        freshItems.push(pendingItem)
      } catch (error) {
        partitionFailures += 1
        this.logger.error('[linear-ingestion] partition:item:failed', {
          ...context,
          error,
        })
      }
    }

    return { cachedVideos, freshItems, deferredItems, partitionFailures }
  }

  private async processItem(pending: PendingVideoItem): Promise<ProcessResult> {
    const { item, id } = pending
    const context = {
      ...this.createContext(item.file, 0, 0),
      id,
    }

    try {
      const extractionResult = await this.metadataExtractor.extract(item.file, {
        idHint: id,
      })
      if (!extractionResult) {
        await this.recordFailure(id)
        this.logger.warn('[linear-ingestion] item:skipped', {
          ...context,
          reason: 'unplayable-or-invalid',
        })
        return { status: 'skipped' }
      }

      const persisted = await this.aggregateRepository.postVideo(
        extractionResult.videoEntity,
      )

      this.sessionRegistry.registerFile(id, item.file)
      await this.clearFailure(id)

      return { status: 'created', video: this.mapToParsed(persisted) }
    } catch (error) {
      await this.recordFailure(id)
      this.logger.error('[linear-ingestion] item:failed', {
        ...context,
        error,
      })
      return { status: 'failed' }
    }
  }

  private async hasRecordedFailure(videoId: string): Promise<boolean> {
    try {
      return await this.failureTracker.hasFailure(videoId)
    } catch (error) {
      this.logger.error('[linear-ingestion] failure-state:lookup-failed', {
        videoId,
        error,
      })
      return false
    }
  }

  private async recordFailure(videoId: string): Promise<void> {
    try {
      await this.failureTracker.recordFailure(videoId)
    } catch (error) {
      this.logger.error('[linear-ingestion] failure-state:record-failed', {
        videoId,
        error,
      })
    }
  }

  private async clearFailure(videoId: string): Promise<void> {
    try {
      await this.failureTracker.clearFailure(videoId)
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
}

export function createLinearVideoIngestionUseCase({
  metadataExtractor,
  aggregateRepository,
  sessionRegistry,
  logger,
  failureTracker,
}: LinearVideoIngestionUseCaseDeps): LinearVideoIngestionUseCase {
  return new LinearVideoIngestionUseCase(
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    logger,
    failureTracker,
  )
}
