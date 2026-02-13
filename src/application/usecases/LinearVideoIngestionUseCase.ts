import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  ILogger,
  IVideoMetadataExtractor,
  IVideoSessionRegistry,
} from '@app/ports'
import type { VideoIngestionUseCase } from './VideoIngestionUseCase'

export class LinearVideoIngestionUseCase implements VideoIngestionUseCase {
  constructor(
    private readonly metadataExtractor: IVideoMetadataExtractor,
    private readonly aggregateRepository: IVideoAggregateRepository,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly logger: ILogger,
  ) {}

  async *execute(items: VideoImportItem[]): AsyncGenerator<ParsedVideo> {
    this.logger.info('[linear-ingestion] execute:start', {
      totalItems: items.length,
    })

    let cachedCount = 0
    let createdCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const [index, item] of items.entries()) {
      const context = this.createContext(item.file, index + 1, items.length)

      try {
        const id = await this.metadataExtractor.generateId(item.file)
        const existing = await this.aggregateRepository.getVideo(id)

        if (existing) {
          this.sessionRegistry.registerFile(id, item.file)
          cachedCount += 1
          yield this.mapToParsed(existing)
          continue
        }

        const extractionResult = await this.metadataExtractor.extract(
          item.file,
          {
            idHint: id,
          },
        )
        if (!extractionResult) {
          skippedCount += 1
          this.logger.warn('[linear-ingestion] item:skipped', {
            ...context,
            id,
            reason: 'unplayable-or-invalid',
          })
          continue
        }

        const persisted = await this.aggregateRepository.postVideo(
          extractionResult.videoEntity,
        )

        this.sessionRegistry.registerFile(id, item.file)
        createdCount += 1

        yield this.mapToParsed(persisted)
      } catch (error) {
        failedCount += 1
        this.logger.error('[linear-ingestion] item:failed', {
          ...context,
          error,
        })
      }
    }

    this.logger.info('[linear-ingestion] execute:complete', {
      totalItems: items.length,
      cachedCount,
      createdCount,
      skippedCount,
      failedCount,
    })
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
}

export function createLinearVideoIngestionUseCase({
  metadataExtractor,
  aggregateRepository,
  sessionRegistry,
  logger,
}: LinearVideoIngestionUseCaseDeps): LinearVideoIngestionUseCase {
  return new LinearVideoIngestionUseCase(
    metadataExtractor,
    aggregateRepository,
    sessionRegistry,
    logger,
  )
}
