import type {
  ExtractVideoMetadataOptions,
  VideoMetadataExtractionResult,
} from '@app/ports'
import type { VideoEntity } from '@domain/entities'
import type { IVideoFileParser } from './IVideoFileParser'
import { FileHashGenerator } from './services/FileHashGenerator'
import { captureThumbnail, loadVideoElement } from './services/videoDomUtils'

export class BrowserVideoFileParser implements IVideoFileParser {
  constructor(
    private readonly hashGenerator: FileHashGenerator = new FileHashGenerator(),
  ) {}

  generateHash = async (video: File) => this.hashGenerator.generate(video)

  async transformVideoData(
    video: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null> {
    if (!this.isVideoCandidate(video)) {
      return null
    }

    const objectUrl = URL.createObjectURL(video)
    let videoElement: HTMLVideoElement | null = null

    try {
      videoElement = await loadVideoElement(objectUrl, {
        label: video.name,
        timeoutMs: 8000,
      })
      if (!videoElement) {
        return null
      }

      const duration = Number.isFinite(videoElement.duration)
        ? Math.max(0, videoElement.duration)
        : 0
      const coverTimestamp = this.getCoverTimestamp(duration)
      const thumb = await captureThumbnail(videoElement, coverTimestamp)
      const id = options?.idHint ?? (await this.generateHash(video))

      const videoEntity: VideoEntity = {
        id,
        title: video.name,
        thumb,
        duration,
        thumbUrls: [],
        tags: [],
      }

      return {
        videoEntity,
        // Playback URLs are acquired from the session registry, not ingestion.
        url: '',
      }
    } catch (error) {
      console.error('[BrowserVideoFileParser] Failed to parse file', error)
      return null
    } finally {
      this.disposeVideoElement(videoElement)
      URL.revokeObjectURL(objectUrl)
    }
  }

  private isVideoCandidate(file: File): boolean {
    return !file.type || file.type.startsWith('video/')
  }

  private getCoverTimestamp(duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
      return 0
    }

    return Math.min(45, duration * 0.1)
  }

  private disposeVideoElement(videoElement: HTMLVideoElement | null): void {
    if (!videoElement) {
      return
    }

    try {
      videoElement.pause()
      videoElement.removeAttribute('src')
      videoElement.load()
    } catch (error) {
      console.warn(
        '[BrowserVideoFileParser] Failed to dispose video element',
        error,
      )
    }
  }
}
