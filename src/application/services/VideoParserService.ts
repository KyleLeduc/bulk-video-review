import type { ParsedVideo, VideoEntity, VideoMetadata } from '@/types'
import { VideoMetadataService } from './VideoMetadataService'

export const parseFileList = async (files: FileList) => {
  const parser = new FileVideoParser()
  const storage = VideoMetadataService.getInstance()

  const videos = []
  for (const file of files) {
    try {
      // try to get the video from storage
      let videoDto = await storage.getVideo(await parser.generateHash(file))

      if (!videoDto) {
        // if we didn't find a video, create
        const newVideoDto = await parser.transformVideoData(file)

        if (newVideoDto) {
          videoDto = await storage.postVideo(newVideoDto)
        } else {
          // we didn't find a video and couldn't create a new VideoEntity
          continue
        }
      }

      const parsedVideo: ParsedVideo = {
        ...videoDto,
        url: URL.createObjectURL(file),
        pinned: false,
      }

      videos.push(parsedVideo)
    } catch (e) {
      console.error('file input error', e)
    }
  }

  return videos
}

class FileVideoParser {
  private video: HTMLVideoElement = document.createElement('video')
  private canvas: HTMLCanvasElement = document.createElement('canvas')
  private context: CanvasRenderingContext2D | null =
    this.canvas.getContext('2d')

  private generateMetadata = async (file: File) => {
    const key = await this.generateHash(file)

    return new Promise<VideoMetadata>((resolve, reject) => {
      let duration: number
      this.video.src = URL.createObjectURL(file)

      const handleLoadedData = () => {
        this.canvas.width = 1920 * 0.5
        this.canvas.height = 1080 * 0.5

        this.video.currentTime = 60
        duration = Math.round(this.video.duration / 60)
      }

      const handleSeek = () => {
        this.context?.drawImage(
          this.video,
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        )
        const thumbUrl = this.canvas.toDataURL('image/jpeg', 0.25)

        const videoMetadata = { duration, thumbUrl, id: key }

        // causes throwing errors about file not found
        // URL.revokeObjectURL(this.video.src)

        resolve(videoMetadata)
      }

      const handleError = (e: ErrorEvent) => {
        URL.revokeObjectURL(this.video.src)
        reject(e)
      }

      this.video.addEventListener('seeked', handleSeek, { once: true })
      this.video.addEventListener('loadeddata', handleLoadedData, {
        once: true,
      })
      this.video.addEventListener('error', handleError, { once: true })
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

  private isValidVideoType = (file: File) => {
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
