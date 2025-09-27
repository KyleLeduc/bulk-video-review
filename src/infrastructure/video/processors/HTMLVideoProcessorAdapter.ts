import type {
  VideoProcessorInterface,
  VideoMetadata,
  ThumbnailOptions,
  BatchThumbnailOptions,
} from '../interfaces/VideoProcessorInterface'
import { HTMLVideoProcessor } from '../HTMLVideoProcessor'

export class HTMLVideoProcessorAdapter implements VideoProcessorInterface {
  private processor: HTMLVideoProcessor | null = null

  async loadVideo(source: File | string): Promise<void> {
    const url =
      typeof source === 'string' ? source : URL.createObjectURL(source)
    this.processor = new HTMLVideoProcessor(url)
    await this.processor.isReady
  }

  async getMetadata(): Promise<VideoMetadata> {
    if (!this.processor) throw new Error('Video not loaded')

    return {
      duration: this.processor.getDuration(),
      width: 0, // HTMLVideoProcessor doesn't expose this yet
      height: 0, // HTMLVideoProcessor doesn't expose this yet
      format: 'unknown',
      size: 0,
    }
  }

  async generateThumbnail(options?: ThumbnailOptions): Promise<string> {
    if (!this.processor) throw new Error('Video not loaded')

    return this.processor.captureThumbnail(options?.timestamp)
  }

  async generateThumbnails(options: BatchThumbnailOptions): Promise<string[]> {
    if (!this.processor) throw new Error('Video not loaded')

    return this.processor.generateThumbnails(options.count)
  }

  dispose(): void {
    if (this.processor) {
      const url = this.processor.getVideoUrl()
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }
    this.processor = null
  }
}
