import type {
  ExtractVideoMetadataOptions,
  VideoMetadataExtractionResult,
} from '@app/ports'

export interface IVideoFileParser {
  generateHash(file: File): Promise<string>
  transformVideoData(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null>
}
