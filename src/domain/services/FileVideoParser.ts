import { ParsedVideoData } from '@/domain/valueObjects/ParsedVideoData'
import type { VideoEntity } from '@/domain/entities/Video'

export class FileVideoParser {
  readonly #canvas: HTMLCanvasElement = document.createElement('canvas')
  readonly #context: CanvasRenderingContext2D | null =
    this.#canvas.getContext('2d')
  readonly #video: HTMLVideoElement = document.createElement('video')

  readonly #generateMetadata = async (file: File): Promise<ParsedVideoData> => {
    const key = await this.generateHash(file)

    return new Promise((resolve, reject) => {
      const videoMetadata = new ParsedVideoData(key)

      const url = URL.createObjectURL(file)
      this.#video.src = url
      videoMetadata.url = url

      this.#video.addEventListener(
        'loadedmetadata',
        async () => {
          this.#canvas.width = this.#video.videoWidth
          this.#canvas.height = this.#video.videoHeight

          videoMetadata.duration = this.#video.duration
          const singleThumb = true

          if (singleThumb) {
            await this.seekToTime(30)
            const thumbnail = this.captureThumbnail()

            videoMetadata.thumbUrl = thumbnail
            videoMetadata.thumbUrls.push(thumbnail)
          } else {
            const thumbnails = await this.generateThumbnails()
            videoMetadata.thumbUrl = thumbnails[1]
            videoMetadata.thumbUrls.push(...thumbnails)
          }

          resolve(videoMetadata)
        },
        {
          once: true,
        },
      )
      this.#video.addEventListener(
        'error',
        (e) => {
          setTimeout(() => URL.revokeObjectURL(this.#video.src), 1000)

          reject(e)
        },
        { once: true },
      )
    })
  }

  captureThumbnail = () => {
    this.#context?.drawImage(
      this.#video,
      0,
      0,
      this.#canvas.width,
      this.#canvas.height,
    )
    return this.#canvas.toDataURL('image/jpeg', 0.25)
  }

  seekToTime = async (time: number) => {
    return new Promise<void>((resolve) => {
      const onSeeked = () => {
        this.#video.removeEventListener('seeked', onSeeked)

        resolve()
      }

      this.#video.addEventListener('seeked', onSeeked)
      this.#video.currentTime = time
    })
  }

  generateThumbnails = async () => {
    const thumbnails: string[] = []

    for (let i = 60; i < this.#video.duration; i += this.#video.duration / 10) {
      await this.seekToTime(Math.floor(i))

      thumbnails.push(this.captureThumbnail())
    }

    return thumbnails
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
