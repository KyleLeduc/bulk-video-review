import type { IVideoThumbnailGenerator } from '@app/ports'

export class VideoThumbnailGeneratorAdapter
  implements IVideoThumbnailGenerator
{
  async generateThumbnails(url: string, count = 10): Promise<string[]> {
    const video = await this.loadVideo(url)
    return this.generateThumbs(video, count)
  }

  private loadVideo(url: string): Promise<HTMLVideoElement> {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'
    video.src = url

    return new Promise((resolve, reject) => {
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

  private seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }

      video.addEventListener('seeked', onSeeked, { once: true })
      video.currentTime = time
    })
  }

  private async captureThumbnail(video: HTMLVideoElement) {
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

  private async generateThumbs(video: HTMLVideoElement, count: number) {
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
}
