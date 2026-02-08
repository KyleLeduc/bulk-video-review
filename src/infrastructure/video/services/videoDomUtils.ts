const createVideoElement = () => {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.crossOrigin = 'anonymous'

  return video
}

type LoadVideoElementOptions = {
  label?: string
  timeoutMs?: number
}

type SeekFailureContext = {
  time: number
  timeoutMs: number
  attempt: number
  attempts: number
  duration: number
  currentTime: number
  readyState: number
  networkState: number
  seeking: boolean
  error: { code: number; message: string } | null
  currentSrc: string
  reason: 'timeout' | 'error' | 'stalled' | 'abort'
}

type SeekToTimeOptions = {
  timeoutsMs?: number[]
}

type SeekFailureError = Error & { context?: SeekFailureContext }

const DEFAULT_SEEK_TIMEOUTS_MS = [1000, 2000, 4000]

export const loadVideoElement = (
  url: string,
  options?: LoadVideoElementOptions,
): Promise<HTMLVideoElement> => {
  const video = createVideoElement()

  return new Promise((resolve, reject) => {
    const timeoutMs = options?.timeoutMs ?? 10000
    let settled = false
    const timeoutId = setTimeout(() => {
      const errorDetail = video.error
        ? {
            code: video.error.code,
            message: video.error.message,
          }
        : null

      console.warn('[videoDomUtils] loadVideoElement timeout', {
        label: options?.label,
        url,
        timeoutMs,
        readyState: video.readyState,
        networkState: video.networkState,
        error: errorDetail,
        currentSrc: video.currentSrc,
      })

      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(new Error('Video metadata load timed out'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }

    const onLoaded = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(video)
    }

    const onError = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      console.error(`Failed to load video`)

      reject(null)
    }

    video.addEventListener('loadedmetadata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.src = url
    video.load()
  })
}

const buildSeekFailureContext = (
  video: HTMLVideoElement,
  time: number,
  timeoutMs: number,
  attempt: number,
  attempts: number,
  reason: SeekFailureContext['reason'],
): SeekFailureContext => {
  const errorDetail = video.error
    ? {
        code: video.error.code,
        message: video.error.message,
      }
    : null

  return {
    time,
    timeoutMs,
    attempt,
    attempts,
    duration: video.duration,
    currentTime: video.currentTime,
    readyState: video.readyState,
    networkState: video.networkState,
    seeking: video.seeking,
    error: errorDetail,
    currentSrc: video.currentSrc,
    reason,
  }
}

const attemptSeek = (
  video: HTMLVideoElement,
  time: number,
  timeoutMs: number,
  attempt: number,
  attempts: number,
) =>
  new Promise<void>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('abort', onAbort)
    }

    const finalize = (fn: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      fn()
    }

    const onSeeked = () => finalize(resolve)
    const onError = () =>
      finalize(() =>
        reject(
          buildSeekFailureContext(
            video,
            time,
            timeoutMs,
            attempt,
            attempts,
            'error',
          ),
        ),
      )
    const onStalled = () =>
      finalize(() =>
        reject(
          buildSeekFailureContext(
            video,
            time,
            timeoutMs,
            attempt,
            attempts,
            'stalled',
          ),
        ),
      )
    const onAbort = () =>
      finalize(() =>
        reject(
          buildSeekFailureContext(
            video,
            time,
            timeoutMs,
            attempt,
            attempts,
            'abort',
          ),
        ),
      )
    const onTimeout = () =>
      finalize(() =>
        reject(
          buildSeekFailureContext(
            video,
            time,
            timeoutMs,
            attempt,
            attempts,
            'timeout',
          ),
        ),
      )

    timeoutId = setTimeout(onTimeout, timeoutMs)
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.addEventListener('stalled', onStalled, { once: true })
    video.addEventListener('abort', onAbort, { once: true })
    video.currentTime = time
  })

export const seekToTime = async (
  video: HTMLVideoElement,
  time: number,
  options?: SeekToTimeOptions,
) => {
  if (!Number.isFinite(time)) {
    throw new Error('Invalid seek time')
  }

  if (Math.abs(video.currentTime - time) < 0.01 && !video.seeking) {
    return
  }

  const rawTimeouts = options?.timeoutsMs ?? DEFAULT_SEEK_TIMEOUTS_MS
  const timeouts = rawTimeouts.filter(
    (timeoutMs) => Number.isFinite(timeoutMs) && timeoutMs > 0,
  )
  const plannedTimeouts =
    timeouts.length > 0 ? timeouts : DEFAULT_SEEK_TIMEOUTS_MS

  let lastError: SeekFailureError | null = null

  for (let attempt = 0; attempt < plannedTimeouts.length; attempt += 1) {
    const timeoutMs = plannedTimeouts[attempt]
    try {
      await attemptSeek(
        video,
        time,
        timeoutMs,
        attempt + 1,
        plannedTimeouts.length,
      )
      return
    } catch (context) {
      const reason = (context as SeekFailureContext | undefined)?.reason
      const message =
        reason === 'timeout' ? 'Video seek timed out' : 'Video seek failed'
      const error = new Error(message) as SeekFailureError
      error.context = context as SeekFailureContext
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('Video seek failed')
}

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

  for (
    let time = durationIncrement;
    time < video.duration;
    time += durationIncrement
  ) {
    try {
      const seekTime = Math.floor(time)
      await seekToTime(video, seekTime)
      thumbnails.push(await captureThumbnail(video))
    } catch (error) {
      const failure = error as SeekFailureError
      console.warn('[videoDomUtils] generateThumbnails failed', {
        time: Math.floor(time),
        duration: video.duration,
        attempt: failure.context?.attempt,
        attempts: failure.context?.attempts,
        timeoutMs: failure.context?.timeoutMs,
        reason: failure.context?.reason,
        error: failure.context?.error ?? failure.message,
        currentSrc: failure.context?.currentSrc,
      })
      return []
    }
  }

  return thumbnails
}
