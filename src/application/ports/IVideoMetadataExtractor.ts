import type { VideoEntity } from '@domain/entities'

export interface VideoMetadataExtractionResult {
  videoEntity: VideoEntity
  url: string
}

export interface ExtractVideoMetadataOptions {
  idHint?: string
}

export interface IVideoMetadataExtractor {
  generateId(file: File): Promise<string>
  extract(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null>
}
