import type { ParsedVideo, VideoEntity, VideoMetadata } from '@/types'
import { VideoMetadataService } from './VideoMetadataService'

export async function* parseFileList(files: FileList) {
  const startTime = performance.now()
  const parser = new FileVideoParser()
  const storage = VideoMetadataService.getInstance()

  const processFile = async (file: File) => {
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
          return null
        }
      }

      const parsedVideo: ParsedVideo = {
        ...videoDto,
        url: URL.createObjectURL(file),
        pinned: false,
      }

      return parsedVideo
    } catch (e) {
      console.error('file input error', e)
    }
  }

  const filePromises = Array.from(files).map((file) => processFile(file))

  const batchSize = 20 // Adjust batch size as needed
  for (let i = 0; i < filePromises.length; i += batchSize) {
    const batch = filePromises.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch)

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        yield result.value
      }
    }

    // Allow the browser to handle other tasks
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const endTime = performance.now()
  console.log(`Total time taken: ${endTime - startTime} milliseconds`)
}

class FileVideoParser {
  private generateMetadata = async (file: File) => {
    const key = await this.generateHash(file)

    return new Promise<VideoMetadata>((resolve, reject) => {
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

        const videoMetadata = { duration, thumbUrl, id: key }

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
