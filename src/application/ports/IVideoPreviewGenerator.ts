import type { VideoPreviewClip, VideoPreviewFrame } from '@domain/entities'

export type VideoPreviewOptions = { duration: number; signal: AbortSignal }

/** Original files are session-owned inputs; generated products contain no source handles. */
export interface IVideoPreviewGenerator {
  generateMotionClips(
    file: File,
    options: VideoPreviewOptions,
  ): Promise<VideoPreviewClip[]>
  generateKeyframes(
    file: File,
    options: VideoPreviewOptions,
  ): Promise<VideoPreviewFrame[]>
}
