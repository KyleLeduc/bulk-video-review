const createVideoElement = (url: string) => {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.crossOrigin = 'anonymous'
  video.src = url

  return video
}

export const loadVideoElement = (url: string): Promise<HTMLVideoElement> => {
  const video = createVideoElement(url)

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

export const seekToTime = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    video.currentTime = time
  })

export const captureThumbnail = async (
  video: HTMLVideoElement,
  timestamp?: number,
) => {
  if (typeof timestamp === 'number') {
    const clampedTime = Math.min(Math.max(timestamp, 0), video.duration)
    await seekToTime(video, clampedTime)
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

export const generateThumbnails = async (
  video: HTMLVideoElement,
  count = 10,
) => {
  if (!count || video.duration === 0) {
    return []
  }

  const thumbnails: string[] = []
  const durationIncrement = video.duration / count

  for (let time = durationIncrement; time < video.duration; time += durationIncrement) {
    await seekToTime(video, Math.floor(time))
    thumbnails.push(await captureThumbnail(video))
  }

  return thumbnails
}
