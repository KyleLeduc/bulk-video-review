import { ParsedVideoData } from '@/domain/valueObjects/ParsedVideoData'
import type { VideoEntity } from '@/domain/entities/Video'

export class FileVideoParser {
  private readonly generateMetadata = async (file: File) => {
    const key = await this.generateHash(file)

    return new Promise<ParsedVideoData>((resolve, reject) => {
      let duration: number

      const video: HTMLVideoElement = document.createElement('video')
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      const context: CanvasRenderingContext2D | null = canvas.getContext('2d')

      video.src = URL.createObjectURL(file)

      const handleLoadedData = () => {
        canvas.width = 1920 * 0.5
        canvas.height = 1080 * 0.5

        video.currentTime = 60
        duration = Math.round(video.duration / 60)
      }

      const handleSeek = () => {
        context?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.25)

        const videoMetadata = new ParsedVideoData(thumbUrl, key, duration)

        URL.revokeObjectURL(video.src)

        resolve(videoMetadata)
      }

      const handleError = (e: ErrorEvent) => {
        URL.revokeObjectURL(video.src)
        reject(e)
      }

      video.addEventListener('seeked', handleSeek, { once: true })
      video.addEventListener('loadedmetadata', handleLoadedData, {
        once: true,
      })
      video.addEventListener('error', handleError, { once: true })
    })
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

  private readonly isValidVideoType = (file: File) => {
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
    if (!this.isValidVideoType(video)) {
      console.log('invalid video type', video)
      return
    }

    try {
      const { thumbUrl, duration, id } = await this.generateMetadata(video)

      const data: VideoEntity = {
        id,
        title: video.name,
        thumb: thumbUrl,
        duration,
        thumbUrls: [thumbUrl],
        tags: [],
      }

      return data
    } catch (e) {
      console.error(e, video)
    }
  }
}
