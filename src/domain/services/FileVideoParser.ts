import { ParsedVideoData } from '@/domain/valueObjects/ParsedVideoData'
import type { VideoEntity } from '@/domain/entities/Video'

export class FileVideoParser {
  private readonly generateMetadata = async (
    file: File,
  ): Promise<ParsedVideoData> => {
    const key = await this.generateHash(file)

    return new Promise((resolve, reject) => {
      const videoMetadata = new ParsedVideoData(key)

      const video: HTMLVideoElement = document.createElement('video')
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      const context: CanvasRenderingContext2D | null = canvas.getContext('2d')

      const url = URL.createObjectURL(file)
      video.src = url
      videoMetadata.url = url

      const handleLoadedData = () => {
        canvas.width = 1920 * 0.5
        canvas.height = 1080 * 0.5

        video.currentTime = 60
        videoMetadata.duration = video.duration
      }

      const handleSeek = () => {
        context?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.25)

        videoMetadata.thumbUrls.push(thumbUrl)
      }

      const seekToTime = (time: number) => {
        return new Promise<void>((resolve) => {
          const onSeeked = () => {
            handleSeek()
            video.removeEventListener('seeked', onSeeked)

            resolve()
          }

          video.addEventListener('seeked', onSeeked)
          video.currentTime = time
        })
      }

      const handleError = (e: ErrorEvent) => {
        this.cleanupVideoElement(video, canvas)
        setTimeout(() => URL.revokeObjectURL(video.src), 1000)

        reject(e)
      }

      video.addEventListener(
        'loadedmetadata',
        async () => {
          handleLoadedData()

          for (
            let i = 60;
            i < videoMetadata.duration;
            i += videoMetadata.duration / 10
          ) {
            await seekToTime(Math.floor(i))
          }

          videoMetadata.thumbUrl = videoMetadata.thumbUrls[0]
          this.cleanupVideoElement(video, canvas)
          resolve(videoMetadata)
        },
        {
          once: true,
        },
      )
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

  private readonly cleanupVideoElement = (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
  ) => {
    setTimeout(() => {
      video.remove()
      canvas.remove()
    }, 1000)
  }

  transformVideoData = async (video: File) => {
    if (!this.isValidVideoType(video)) {
      console.log('invalid video type', video)
      return
    }

    try {
      const { thumbUrl, duration, id, url, thumbUrls } =
        await this.generateMetadata(video)

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
