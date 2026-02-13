import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
  VideoMetadataExtractionResult,
} from '@app/ports'

interface PendingVideoItem {
  item: VideoImportItem
  id: string
}

type VideoLogContext = {
  id?: string
  fileName: string
  fileSizeBytes: number
  fileType: string
}

export class AddVideosFromFilesUseCase {
  constructor(
    private readonly metadataExtractor: IVideoMetadataExtractor,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly logger: ILogger,
    private readonly sessionRegistry: IVideoSessionRegistry,
  ) {}

  async *execute(items: VideoImportItem[]): AsyncGenerator<ParsedVideo> {
    const startTime = performance.now()
    this.logger.info('[add-videos] execute:start', { totalItems: items.length })

    const { cachedVideos, pendingItems } = await this.partitionItems(items)
    this.logger.info('[add-videos] execute:partition-complete', {
      totalItems: items.length,
      cachedItems: cachedVideos.length,
      pendingItems: pendingItems.length,
      elapsedMs: this.elapsedMs(startTime),
    })

    for (const video of cachedVideos) {
      this.logger.debug('[add-videos] execute:yield-cached', { id: video.id })
      yield video
    }

    for (const [index, pending] of pendingItems.entries()) {
      this.logger.debug('[add-videos] execute:process-pending:start', {
        queueIndex: index + 1,
        queueLength: pendingItems.length,
        ...this.createVideoLogContext(pending.item.file, pending.id),
      })
      const parsed = await this.processNewVideo(pending)
      if (parsed) {
        this.logger.debug('[add-videos] execute:process-pending:yield', {
          queueIndex: index + 1,
          queueLength: pendingItems.length,
          id: parsed.id,
        })
        yield parsed
      } else {
        this.logger.warn('[add-videos] execute:process-pending:skipped', {
          queueIndex: index + 1,
          queueLength: pendingItems.length,
          ...this.createVideoLogContext(pending.item.file, pending.id),
        })
      }
    }

    this.logger.info('[add-videos] execute:complete', {
      totalItems: items.length,
      cachedItems: cachedVideos.length,
      pendingItems: pendingItems.length,
      elapsedMs: this.elapsedMs(startTime),
    })
  }

  private async partitionItems(items: VideoImportItem[]) {
    const cachedVideos: ParsedVideo[] = []
    const pendingItems: PendingVideoItem[] = []

    for (const [index, item] of items.entries()) {
      const itemStartTime = performance.now()
      const fileContext = this.createVideoLogContext(item.file)

      try {
        this.logger.debug('[add-videos] partition:item:start', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...fileContext,
        })

        const generateIdStartTime = performance.now()
        this.logger.debug('[add-videos] partition:item:generate-id:start', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...fileContext,
        })
        const id = await this.metadataExtractor.generateId(item.file)
        this.logger.debug('[add-videos] partition:item:generate-id:complete', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...this.createVideoLogContext(item.file, id),
          elapsedMs: this.elapsedMs(generateIdStartTime),
        })

        const lookupStartTime = performance.now()
        this.logger.debug('[add-videos] partition:item:lookup-cache:start', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...this.createVideoLogContext(item.file, id),
        })
        const aggregate = await this.aggregateRepository.getVideo(id)
        this.logger.debug('[add-videos] partition:item:lookup-cache:complete', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...this.createVideoLogContext(item.file, id),
          cacheHit: Boolean(aggregate),
          elapsedMs: this.elapsedMs(lookupStartTime),
        })

        if (aggregate) {
          this.sessionRegistry.registerFile(id, item.file)
          cachedVideos.push({
            ...aggregate,
            url: '',
            pinned: false,
          })
          this.logger.debug('[add-videos] partition:item:cached', {
            itemIndex: index + 1,
            itemCount: items.length,
            ...this.createVideoLogContext(item.file, id),
          })
        } else {
          pendingItems.push({ item, id })
          this.logger.debug('[add-videos] partition:item:pending', {
            itemIndex: index + 1,
            itemCount: items.length,
            ...this.createVideoLogContext(item.file, id),
          })
        }

        this.logger.debug('[add-videos] partition:item:complete', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...this.createVideoLogContext(item.file, id),
          elapsedMs: this.elapsedMs(itemStartTime),
        })
      } catch (error) {
        this.logger.error('[add-videos] partition:item:failed', {
          itemIndex: index + 1,
          itemCount: items.length,
          ...fileContext,
          elapsedMs: this.elapsedMs(itemStartTime),
          error,
        })
        throw error
      }
    }

    return { cachedVideos, pendingItems }
  }

  private async processNewVideo(
    pending: PendingVideoItem,
  ): Promise<ParsedVideo | null> {
    const startTime = performance.now()
    const logContext = this.createVideoLogContext(pending.item.file, pending.id)
    let stage = 'extract:start'

    this.logger.debug('[add-videos] process-new-video:start', logContext)

    try {
      const extractStartTime = performance.now()
      this.logger.debug('[add-videos] process-new-video:extract:start', {
        ...logContext,
      })
      const extractionResult = await this.metadataExtractor.extract(
        pending.item.file,
        { idHint: pending.id },
      )
      this.logger.debug('[add-videos] process-new-video:extract:complete', {
        ...logContext,
        elapsedMs: this.elapsedMs(extractStartTime),
        success: Boolean(extractionResult),
      })

      if (!extractionResult) {
        this.logger.warn('[add-videos] process-new-video:extract:empty', {
          ...logContext,
          elapsedMs: this.elapsedMs(startTime),
        })
        return null
      }

      stage = 'session-register'
      this.logger.debug(
        '[add-videos] process-new-video:register-session:start',
        {
          ...logContext,
        },
      )
      this.sessionRegistry.registerFile(pending.id, pending.item.file)
      this.logger.debug(
        '[add-videos] process-new-video:register-session:complete',
        {
          ...logContext,
        },
      )

      try {
        stage = 'persist'
        this.logger.debug('[add-videos] process-new-video:persist:start', {
          ...logContext,
        })
        const persisted = await this.persistAndMapResult(extractionResult)
        this.logger.info('[add-videos] process-new-video:persist:complete', {
          ...logContext,
          elapsedMs: this.elapsedMs(startTime),
        })
        return persisted
      } finally {
        stage = 'revoke-object-url'
        this.logger.debug('[add-videos] process-new-video:revoke-url:start', {
          ...logContext,
          hasBlobUrl: extractionResult.url.startsWith('blob:'),
        })
        this.revokeObjectUrl(extractionResult.url)
        this.logger.debug(
          '[add-videos] process-new-video:revoke-url:complete',
          {
            ...logContext,
            elapsedMs: this.elapsedMs(startTime),
          },
        )
      }
    } catch (error) {
      this.logger.error('[add-videos] process-new-video:failed', {
        ...logContext,
        stage,
        elapsedMs: this.elapsedMs(startTime),
        error,
      })
      this.logger.error('Failed to process file', error)
      return null
    }
  }

  private async persistAndMapResult(
    extractionResult: VideoMetadataExtractionResult,
  ): Promise<ParsedVideo> {
    const startTime = performance.now()
    this.logger.debug('[add-videos] persist:start', {
      id: extractionResult.videoEntity.id,
      title: extractionResult.videoEntity.title,
    })

    const aggregate = await this.aggregateRepository.postVideo(
      extractionResult.videoEntity,
    )
    this.logger.debug('[add-videos] persist:complete', {
      id: extractionResult.videoEntity.id,
      elapsedMs: this.elapsedMs(startTime),
    })

    return {
      ...aggregate,
      url: '',
      pinned: false,
    }
  }

  private revokeObjectUrl(url: string) {
    if (!url || !url.startsWith('blob:')) {
      this.logger.debug('[add-videos] revoke-object-url:skip', {
        hasUrl: Boolean(url),
        urlPrefix: url ? url.slice(0, 5) : '',
      })
      return
    }

    const revoke = (
      URL as unknown as { revokeObjectURL?: (url: string) => void }
    ).revokeObjectURL
    if (typeof revoke !== 'function') {
      this.logger.warn('[add-videos] revoke-object-url:unavailable')
      return
    }

    try {
      revoke(url)
      this.logger.debug('[add-videos] revoke-object-url:complete', {
        urlPrefix: url.slice(0, 12),
      })
    } catch (error) {
      this.logger.error('Failed to revoke object URL', error)
    }
  }

  private createVideoLogContext(file: File, id?: string): VideoLogContext {
    return {
      id,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileType: file.type || 'unknown',
    }
  }

  private elapsedMs(startTime: number): number {
    return Number((performance.now() - startTime).toFixed(2))
  }
}

export interface AddVideosFromFilesUseCaseDeps {
  metadataExtractor: IVideoMetadataExtractor
  aggregateRepository: IVideoAggregateRepository
  logger: ILogger
  sessionRegistry: IVideoSessionRegistry
}

export function createAddVideosFromFilesUseCase({
  metadataExtractor,
  aggregateRepository,
  logger,
  sessionRegistry,
}: AddVideosFromFilesUseCaseDeps): AddVideosFromFilesUseCase {
  return new AddVideosFromFilesUseCase(
    metadataExtractor,
    aggregateRepository,
    logger,
    sessionRegistry,
  )
}
