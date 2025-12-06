import type { IVideoFileParser } from '@infra/video'
import type {
  ExtractVideoMetadataOptions,
  IVideoMetadataExtractor,
  VideoMetadataExtractionResult,
} from '@app/ports'
import type { ILogger } from '@app/ports'

export class VideoMetadataExtractorAdapter implements IVideoMetadataExtractor {
  constructor(
    private readonly parser: IVideoFileParser,
    private readonly logger: ILogger,
  ) {}

  generateId(file: File): Promise<string> {
    return this.parser.generateHash(file)
  }

  async extract(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null> {
    try {
      return await this.parser.transformVideoData(file, options)
    } catch (error) {
      this.logger.error('Failed to parse video', error)
      return null
    }
  }
}
