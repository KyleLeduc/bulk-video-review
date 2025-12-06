import { VideoFileParser } from '@infra/video'
import type {
  ExtractVideoMetadataOptions,
  IVideoMetadataExtractor,
  VideoMetadataExtractionResult,
} from '@app/ports'

export class VideoMetadataExtractorAdapter implements IVideoMetadataExtractor {
  constructor(
    private readonly parser: VideoFileParser = new VideoFileParser(),
  ) {}

  generateId(file: File): Promise<string> {
    return this.parser.generateHash(file)
  }

  async extract(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null> {
    const result = await this.parser.transformVideoData(file)

    if (!result) {
      return null
    }

    const { videoEntity, url } = result
    if (options?.idHint) {
      videoEntity.id = options.idHint
    }

    return {
      videoEntity,
      url,
    }
  }
}
