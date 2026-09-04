import type { VideoPreviewFrame } from '@domain/entities'

export interface IVideoPreviewRepository {
  getFrames(videoId: string): Promise<VideoPreviewFrame[]>
  replaceFrames(videoId: string, frames: VideoPreviewFrame[]): Promise<void>
  deleteFrames(videoId: string): Promise<void>
  clear(): Promise<void>
}
