import type {
  ExtractVideoMetadataOptions,
  VideoMetadataExtractionResult,
} from '@app/ports'
import type { VideoEntity } from '@domain/entities'
import { FileHashGenerator } from './services/FileHashGenerator'
import { captureThumbnail, loadVideoElement } from './services/videoDomUtils'
import type { IVideoFileParser } from './IVideoFileParser'

const VALID_VIDEO_MIME_TYPES = [
  'video/mp4', // MP4 (H.264/AAC)
  'video/webm', // WebM (VP8/VP9)
  'video/ogg', // Ogg (Theora/Vorbis)
  'video/quicktime', // QuickTime
  'video/x-matroska', // Matroska (WebM compatible codecs)
]

export class VideoFileParser implements IVideoFileParser {
  constructor(
    private readonly hashGenerator: FileHashGenerator = new FileHashGenerator(),
  ) {}

  generateHash = async (video: File) => this.hashGenerator.generate(video)

  private readonly isValidVideoType = (video: File) =>
    video.type ? VALID_VIDEO_MIME_TYPES.includes(video.type) : false

  transformVideoData = async (
    video: File,
    options?: ExtractVideoMetadataOptions,
  ): Promise<VideoMetadataExtractionResult | null> => {
    if (!this.isValidVideoType(video)) {
      console.log('invalid video type', video)
      return null
    }

    const url = URL.createObjectURL(video)

    try {
      const videoElement = await loadVideoElement(url)
      const duration = videoElement.duration
      const thumbUrl = await captureThumbnail(
        videoElement,
        Math.min(45, duration * 0.1),
      )
      const thumbUrls: string[] = []
      const id = options?.idHint ?? (await this.generateHash(video))

      const videoEntity: VideoEntity = {
        id,
        title: video.name,
        thumb: thumbUrl,
        duration,
        thumbUrls,
        tags: [],
      }

      return { videoEntity, url }
    } catch (error) {
      console.error('Failed to parse video', error, video)
      URL.revokeObjectURL(url)
      return null
    }
  }
}
