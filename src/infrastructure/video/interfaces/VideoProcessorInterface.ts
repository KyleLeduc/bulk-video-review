export interface VideoMetadata {
  duration: number
  width: number
  height: number
  format: string
  size: number
}

export interface ThumbnailOptions {
  timestamp?: number
  width?: number
  height?: number
  quality?: number
}

export interface BatchThumbnailOptions extends ThumbnailOptions {
  count: number
  startTime?: number
  endTime?: number
}

export interface VideoProcessorInterface {
  loadVideo(source: File | string): Promise<void>
  getMetadata(): Promise<VideoMetadata>
  generateThumbnail(options?: ThumbnailOptions): Promise<string>
  generateThumbnails(options: BatchThumbnailOptions): Promise<string[]>
  dispose(): void
}

export interface VideoProcessorFactory {
  create(source: File | string): VideoProcessorInterface
}
