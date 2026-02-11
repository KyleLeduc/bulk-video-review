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

export class AddVideosFromFilesUseCase {
  constructor(
    private readonly metadataExtractor: IVideoMetadataExtractor,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly logger: ILogger,
    private readonly sessionRegistry: IVideoSessionRegistry,
  ) {}

  async *execute(items: VideoImportItem[]): AsyncGenerator<ParsedVideo> {
    const startTime = performance.now()
    const { cachedVideos, pendingItems } = await this.partitionItems(items)

    for (const video of cachedVideos) {
      yield video
    }

    for (const pending of pendingItems) {
      const parsed = await this.processNewVideo(pending)
      if (parsed) {
        yield parsed
      }
    }

    const endTime = performance.now()
    this.logger.info(`Total time taken: ${endTime - startTime} milliseconds`)
  }

  private async partitionItems(items: VideoImportItem[]) {
    const cachedVideos: ParsedVideo[] = []
    const pendingItems: PendingVideoItem[] = []

    for (const item of items) {
      const id = await this.metadataExtractor.generateId(item.file)
      const aggregate = await this.aggregateRepository.getVideo(id)

      if (aggregate) {
        this.sessionRegistry.registerFile(id, item.file)
        cachedVideos.push({
          ...aggregate,
          url: '',
          pinned: false,
        })
      } else {
        pendingItems.push({ item, id })
      }
    }

    return { cachedVideos, pendingItems }
  }

  private async processNewVideo(
    pending: PendingVideoItem,
  ): Promise<ParsedVideo | null> {
    try {
      const extractionResult = await this.metadataExtractor.extract(
        pending.item.file,
        { idHint: pending.id },
      )

      if (!extractionResult) {
        return null
      }

      this.sessionRegistry.registerFile(pending.id, pending.item.file)
      try {
        return await this.persistAndMapResult(extractionResult)
      } finally {
        this.revokeObjectUrl(extractionResult.url)
      }
    } catch (error) {
      this.logger.error('Failed to process file', error)
      return null
    }
  }

  private async persistAndMapResult(
    extractionResult: VideoMetadataExtractionResult,
  ): Promise<ParsedVideo> {
    const aggregate = await this.aggregateRepository.postVideo(
      extractionResult.videoEntity,
    )

    return {
      ...aggregate,
      url: '',
      pinned: false,
    }
  }

  private revokeObjectUrl(url: string) {
    if (!url || !url.startsWith('blob:')) {
      return
    }

    const revoke = (
      URL as unknown as { revokeObjectURL?: (url: string) => void }
    ).revokeObjectURL
    if (typeof revoke !== 'function') {
      return
    }

    try {
      revoke(url)
    } catch (error) {
      this.logger.error('Failed to revoke object URL', error)
    }
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
