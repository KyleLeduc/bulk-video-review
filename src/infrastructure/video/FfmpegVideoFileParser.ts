import type {
  ExtractVideoMetadataOptions,
  VideoMetadataExtractionResult,
} from '@app/ports'
import type { IVideoFileParser } from './IVideoFileParser'
import { FileHashGenerator } from './services/FileHashGenerator'

/**
 * Placeholder FFmpeg-based parser; currently returns minimal metadata while wiring is built out.
 */
export class FfmpegVideoFileParser implements IVideoFileParser {
  constructor(
    private readonly hashGenerator: FileHashGenerator = new FileHashGenerator(),
  ) {}

  generateHash = async (video: File) => this.hashGenerator.generate(video)

  async transformVideoData(
    video: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null> {
    const id = options?.idHint ?? (await this.generateHash(video))

    return {
      videoEntity: {
        id,
        title: video.name,
        thumb: '',
        duration: 0,
        thumbUrls: [],
        tags: [],
      },
      url: URL.createObjectURL(video),
    }
  }
}
