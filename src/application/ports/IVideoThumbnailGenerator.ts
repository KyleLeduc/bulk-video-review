import type { VideoPreviewFrame } from '@domain/entities'
import type { VideoProcessingTimingObserver } from './VideoProcessingTiming'

export type VideoPreviewGenerationProgress = {
  stage: 'loading' | 'seeking' | 'encoding' | 'persisting'
  completedFrames: number
  totalFrames: number
  timestampSeconds?: number
}

export type VideoPreviewGenerationOptions = {
  count?: number
  maxWidth?: number
  signal?: AbortSignal
  onProgress?: (progress: VideoPreviewGenerationProgress) => void
  onTiming?: VideoProcessingTimingObserver
}

export interface IVideoThumbnailGenerator {
  generateThumbnails(
    url: string,
    options?: VideoPreviewGenerationOptions,
  ): Promise<VideoPreviewFrame[]>
}
