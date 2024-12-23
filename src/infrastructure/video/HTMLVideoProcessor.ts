export class HTMLVideoProcessor {
  readonly #canvas: HTMLCanvasElement = document.createElement('canvas')
  readonly #context: CanvasRenderingContext2D | null =
    this.#canvas.getContext('2d')
  readonly #video: HTMLVideoElement = document.createElement('video')

  isReady: Promise<void>

  constructor(video: HTMLVideoElement | string) {
    this.isReady = new Promise((resolve) => {
      this.#video.addEventListener(
        'loadedmetadata',
        async () => {
          this.#canvas.width = this.#video.videoWidth
          this.#canvas.height = this.#video.videoHeight

          resolve()
        },
        {
          once: true,
        },
      )
    })

    this.#video.addEventListener(
      'error',
      (e) => {
        console.error('Failed to load video:', e)

        setTimeout(() => URL.revokeObjectURL(this.#video.src), 1000)
      },
      { once: true },
    )

    if (typeof video === 'string') {
      this.#video.src = video
    } else {
      this.#video.src = video.src
    }
  }

  getDuration(): number {
    return this.#video.duration
  }

  getVideoUrl(): string {
    return this.#video.src
  }

  captureThumbnail = async (timestamp?: number) => {
    if (timestamp) {
      await this.seekToTime(timestamp)
    }

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

  generateThumbnails = async (count = 10) => {
    const thumbnails: string[] = []
    const durationIncrement = this.#video.duration / count

    for (
      let i = durationIncrement;
      i < this.#video.duration;
      i += durationIncrement
    ) {
      await this.seekToTime(Math.floor(i))

      thumbnails.push(await this.captureThumbnail())
    }

    return thumbnails
  }
}
