import type { VideoEntity } from '@domain/entities'
import { ParsedVideoData } from '@domain/valueObjects'
import { HTMLVideoProcessor } from './HTMLVideoProcessor'

export class VideoFileParser {
  readonly #generateMetadata = async (file: File): Promise<ParsedVideoData> => {
    const key = await this.generateHash(file)
    const url = URL.createObjectURL(file)

    const videoMetadata = new ParsedVideoData(key)
    const videoProcessor = new HTMLVideoProcessor(url)

    await videoProcessor.isReady

    videoMetadata.url = videoProcessor.getVideoUrl()
    videoMetadata.duration = videoProcessor.getDuration()

    const posterThumbnailTimestamp = Math.min(45, videoMetadata.duration / 10)
    await videoProcessor.seekToTime(posterThumbnailTimestamp)
    const thumbnail = await videoProcessor.captureThumbnail()

    videoMetadata.thumbUrl = thumbnail

    return videoMetadata
  }

  generateHash = async (file: File) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(file.name + file.size)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return hashHex
  }

  readonly #isValidVideoType = (file: File) => {
    const validVideoMimeTypes = [
      'video/mp4', // MP4 (H.264/AAC)
      'video/webm', // WebM (VP8/VP9)
      'video/ogg', // Ogg (Theora/Vorbis)
      'video/quicktime', // QuickTime
      'video/x-matroska', // Matroska (WebM compatible codecs)
    ]

    return validVideoMimeTypes.includes(file.type)
  }

  transformVideoData = async (video: File) => {
    if (!this.#isValidVideoType(video)) {
      console.log('invalid video type', video)
      return
    }

    try {
      const { thumbUrl, duration, id, url, thumbUrls } =
        await this.#generateMetadata(video)

      const videoEntity: VideoEntity = {
        id,
        title: video.name,
        thumb: thumbUrl,
        duration,
        thumbUrls,
        tags: [],
      }

      return { videoEntity, url }
    } catch (e) {
      console.error(e, video)
    }
  }
}
