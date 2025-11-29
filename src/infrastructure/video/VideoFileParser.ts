import type { VideoEntity } from '@domain/entities'
import { FileHashGenerator } from './services/FileHashGenerator'

const VALID_VIDEO_MIME_TYPES = [
  'video/mp4', // MP4 (H.264/AAC)
  'video/webm', // WebM (VP8/VP9)
  'video/ogg', // Ogg (Theora/Vorbis)
  'video/quicktime', // QuickTime
  'video/x-matroska', // Matroska (WebM compatible codecs)
]

export class VideoFileParser {
  constructor(
    private readonly hashGenerator: FileHashGenerator = new FileHashGenerator(),
  ) {}

  generateHash = async (video: File) => this.hashGenerator.generate(video)

  private readonly isValidVideoType = (video: File) =>
    video.type ? VALID_VIDEO_MIME_TYPES.includes(video.type) : false

  private loadVideoElement = (url: string) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'
    video.src = url

    return new Promise<HTMLVideoElement>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
      }

      const onLoaded = () => {
        cleanup()
        resolve(video)
      }

      const onError = (event: Event | string) => {
        cleanup()
        reject(new Error(`Failed to load video metadata: ${event}`))
      }

      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      video.addEventListener('error', onError, { once: true })
    })
  }

  private seekToTime = async (video: HTMLVideoElement, time: number) =>
    new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }

      video.addEventListener('seeked', onSeeked, { once: true })
      video.currentTime = time
    })

  private captureThumbnail = async (
    video: HTMLVideoElement,
    timestamp?: number,
  ) => {
    if (typeof timestamp === 'number') {
      const clampedTime = Math.min(Math.max(timestamp, 0), video.duration)
      await this.seekToTime(video, clampedTime)
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1
    canvas.height = video.videoHeight || 1

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Unable to capture thumbnail: canvas context missing')
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.25)
  }

  private generateThumbnails = async (video: HTMLVideoElement, count = 10) => {
    if (!count || video.duration === 0) {
      return []
    }

    const thumbnails: string[] = []
    const durationIncrement = video.duration / count

    for (
      let time = durationIncrement;
      time < video.duration;
      time += durationIncrement
    ) {
      await this.seekToTime(video, Math.floor(time))
      thumbnails.push(await this.captureThumbnail(video))
    }

    return thumbnails
  }

  transformVideoData = async (video: File) => {
    if (!this.isValidVideoType(video)) {
      console.log('invalid video type', video)
      return null
    }

    const url = URL.createObjectURL(video)

    try {
      const videoElement = await this.loadVideoElement(url)
      const duration = videoElement.duration
      const thumbUrl = await this.captureThumbnail(
        videoElement,
        Math.min(45, duration * 0.1),
      )
      const thumbUrls = await this.generateThumbnails(videoElement)
      const id = await this.generateHash(video)

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
