import type { VideoEntity } from '@domain/entities'
import type { VideoProcessingTimingObserver } from './VideoProcessingTiming'

export interface VideoMetadataExtractionResult {
  videoEntity: VideoEntity
  url: string
}

export interface ExtractVideoMetadataOptions {
  idHint?: string
  onTiming?: VideoProcessingTimingObserver
}

export interface IVideoMetadataExtractor {
  generateId(file: File): Promise<string>
  extract(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null>
}
