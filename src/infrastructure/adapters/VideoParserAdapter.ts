import { VideoFileParser } from '@infra/video'
import type { IVideoParser, ILogger } from '@app/ports'
import type { ParsedVideo } from '@domain/entities'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type { VideoImportItem } from '@domain/valueObjects'

export class VideoParserAdapter implements IVideoParser {
  constructor(
    private readonly storage: IVideoAggregateRepository,
    private readonly logger: ILogger,
    private readonly parser: VideoFileParser = new VideoFileParser(),
  ) {}

  async *parseItems(items: VideoImportItem[]): AsyncGenerator<ParsedVideo> {
    const startTime = performance.now()

    const { itemsToProcess, cachedVideos } =
      await this.#partitionExistingVideos(items)

    for (const video of cachedVideos) {
      yield video
    }

    if (itemsToProcess.length > 0) {
      for (const item of itemsToProcess) {
        try {
          const videoItem = await this.#processVideo(item)

          if (videoItem) yield videoItem
        } catch (e) {
          this.logger.error('Failed to process file', e)
        }
      }
    }

    const endTime = performance.now()
    this.logger.info(`Total time taken: ${endTime - startTime} milliseconds`)
  }

  readonly #processVideo = async (item: VideoImportItem) => {
    try {
      const result = await this.parser.transformVideoData(item.file)
      if (!result) return null

      const { videoEntity, url } = result

      if (videoEntity) {
        const videoDto = await this.storage.postVideo(videoEntity)
        return {
          ...videoDto,
          url,
          pinned: false,
        }
      }

      return null
    } catch (e) {
      this.logger.error('File input error', e)

      return null
    }
  }

  readonly #partitionExistingVideos = async (items: VideoImportItem[]) => {
    const foundVideos: ParsedVideo[] = []
    const itemsToProcess: VideoImportItem[] = []

    for (const item of items) {
      const hashedId = await this.parser.generateHash(item.file)
      const videoEntity = await this.storage.getVideo(hashedId)

      if (videoEntity) {
        const blobUrl = URL.createObjectURL(item.file)

        foundVideos.push({
          ...videoEntity,
          url: blobUrl,
          pinned: false,
        })
      } else {
        itemsToProcess.push(item)
      }
    }

    return { cachedVideos: foundVideos, itemsToProcess }
  }
}
