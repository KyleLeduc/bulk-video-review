import type { VideoPreviewFrame } from '@domain/entities'
import type {
  VideoPreviewGenerationOptions,
  VideoProcessingTimingObserver,
} from '@app/ports'
import {
  measureVideoProcessing,
  measureVideoProcessingSync,
} from '@app/services/videoProcessingTiming'

const createVideoElement = () => {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.crossOrigin = 'anonymous'

  return video
}

type LoadVideoElementOptions = {
  label?: string
  timeoutMs?: number
  signal?: AbortSignal
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
  signal?: AbortSignal
}

type SeekFailureError = Error & { context?: SeekFailureContext }

const DEFAULT_SEEK_TIMEOUTS_MS = [1000, 2000, 4000]
const DEFAULT_PREVIEW_MAX_WIDTH = 480
const DEFAULT_JPEG_QUALITY = 0.72

const DEFAULT_PREVIEW_ENCODE_TIMEOUT_MS = 10_000

type CaptureFrameOptions = {
  maxWidth?: number
  signal?: AbortSignal
  onTiming?: VideoProcessingTimingObserver
}

const createAbortError = () =>
  new DOMException('Video operation aborted', 'AbortError')

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as { name?: unknown } | null)?.name === 'AbortError'

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

export const disposeVideoElement = (video: HTMLVideoElement | null): void => {
  if (!video) {
    return
  }

  try {
    video.pause()
    video.removeAttribute('src')
    video.load()
  } catch (error) {
    console.warn('[videoDomUtils] Failed to dispose video element', error)
  }
}

export const loadVideoElement = (
  url: string,
  options?: LoadVideoElementOptions,
): Promise<HTMLVideoElement> => {
  const video = createVideoElement()

  if (options?.signal?.aborted) {
    disposeVideoElement(video)
    return Promise.reject(createAbortError())
  }

  return new Promise((resolve, reject) => {
    const timeoutMs = options?.timeoutMs ?? 10000
    let settled = false
    let onSignalAbort = () => {}
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
      disposeVideoElement(video)
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      options?.signal?.removeEventListener('abort', onSignalAbort)
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
      disposeVideoElement(video)
      console.error('Failed to load video metadata')
      reject(new Error('Failed to load video metadata'))
    }

    video.addEventListener('loadedmetadata', onLoaded, { once: true })

    onSignalAbort = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      disposeVideoElement(video)
      reject(createAbortError())
    }
    video.addEventListener('error', onError, { once: true })
    options?.signal?.addEventListener('abort', onSignalAbort, {
      once: true,
    })
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
  signal?: AbortSignal,
) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

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
      signal?.removeEventListener('abort', onSignalAbort)
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
    const onSignalAbort = () => finalize(() => reject(createAbortError()))

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
    signal?.addEventListener('abort', onSignalAbort, { once: true })
    video.currentTime = time
  })

export const seekToTime = async (
  video: HTMLVideoElement,
  time: number,
  options?: SeekToTimeOptions,
) => {
  throwIfAborted(options?.signal)

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
    throwIfAborted(options?.signal)
    const timeoutMs = plannedTimeouts[attempt]
    try {
      await attemptSeek(
        video,
        time,
        timeoutMs,
        attempt + 1,
        plannedTimeouts.length,
        options?.signal,
      )
      return
    } catch (context) {
      if (isAbortError(context)) {
        throw context
      }

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

const getCaptureDimensions = (
  video: HTMLVideoElement,
  requestedMaxWidth?: number,
) => {
  const sourceWidth = Math.max(1, video.videoWidth || 1)
  const sourceHeight = Math.max(1, video.videoHeight || 1)
  const maxWidth =
    Number.isFinite(requestedMaxWidth) && Number(requestedMaxWidth) > 0
      ? Math.floor(Number(requestedMaxWidth))
      : DEFAULT_PREVIEW_MAX_WIDTH
  const scale = Math.min(1, maxWidth / sourceWidth)

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

const encodeCanvas = (
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      signal?.removeEventListener('abort', onSignalAbort)
    }

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    const onSignalAbort = () =>
      settle(() => {
        reject(createAbortError())
      })

    const onTimeout = () =>
      settle(() => {
        reject(new Error('Video preview encoding timed out'))
      })

    try {
      throwIfAborted(signal)
      signal?.addEventListener('abort', onSignalAbort, { once: true })
      timeoutId = setTimeout(onTimeout, DEFAULT_PREVIEW_ENCODE_TIMEOUT_MS)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            settle(() => {
              reject(new Error('Unable to encode video preview'))
            })
            return
          }

          settle(() => {
            resolve(blob)
          })
        },
        'image/jpeg',
        DEFAULT_JPEG_QUALITY,
      )
    } catch (error) {
      settle(() => {
        reject(error)
      })
    }
  })

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unable to serialize video cover'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Unable to serialize video cover'))
    reader.readAsDataURL(blob)
  })

export const capturePreviewFrame = async (
  video: HTMLVideoElement,
  timestampSeconds: number,
  options?: CaptureFrameOptions,
): Promise<VideoPreviewFrame> => {
  throwIfAborted(options?.signal)

  const { canvas, width, height } = measureVideoProcessingSync(
    'capture',
    () => {
      const { width, height } = getCaptureDimensions(video, options?.maxWidth)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Unable to capture thumbnail: canvas context missing')
      }

      context.drawImage(video, 0, 0, width, height)
      return { canvas, width, height }
    },
    options?.onTiming,
  )
  throwIfAborted(options?.signal)
  const blob = await measureVideoProcessing(
    'encode',
    () => encodeCanvas(canvas, options?.signal),
    options?.onTiming,
  )

  return {
    timestampSeconds,
    blob,
    width,
    height,
  }
}

export const captureThumbnail = async (
  video: HTMLVideoElement,
  timestamp?: number,
  options?: CaptureFrameOptions,
): Promise<string> => {
  throwIfAborted(options?.signal)

  let captureTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
  if (typeof timestamp === 'number') {
    const upperBound =
      Number.isFinite(video.duration) && video.duration >= 0
        ? video.duration
        : Number.POSITIVE_INFINITY
    captureTime = Math.min(Math.max(timestamp, 0), upperBound)
    await measureVideoProcessing(
      'seek',
      () => seekToTime(video, captureTime, { signal: options?.signal }),
      options?.onTiming,
    )
  }

  const frame = await capturePreviewFrame(video, captureTime, options)
  return await measureVideoProcessing(
    'serialize',
    () => blobToDataUrl(frame.blob),
    options?.onTiming,
  )
}

const normalizeGenerationOptions = (
  countOrOptions: number | VideoPreviewGenerationOptions,
): VideoPreviewGenerationOptions =>
  typeof countOrOptions === 'number'
    ? { count: countOrOptions }
    : countOrOptions

export const generateThumbnails = async (
  video: HTMLVideoElement,
  countOrOptions: number | VideoPreviewGenerationOptions = 10,
): Promise<VideoPreviewFrame[]> => {
  const options = normalizeGenerationOptions(countOrOptions)
  const count = Math.max(0, Math.floor(options.count ?? 10))
  if (!count || !Number.isFinite(video.duration) || video.duration <= 0) {
    return []
  }

  const frames: VideoPreviewFrame[] = []
  const durationIncrement = video.duration / count
  const totalFrames = Math.max(0, count - 1)

  for (let index = 1; index < count; index += 1) {
    const seekTime = Math.floor(durationIncrement * index)
    try {
      throwIfAborted(options.signal)
      options.onProgress?.({
        stage: 'seeking',
        completedFrames: frames.length,
        totalFrames,
        timestampSeconds: seekTime,
      })
      await measureVideoProcessing(
        'seek',
        () => seekToTime(video, seekTime, { signal: options.signal }),
        options.onTiming,
      )
      options.onProgress?.({
        stage: 'encoding',
        completedFrames: frames.length,
        totalFrames,
        timestampSeconds: seekTime,
      })
      frames.push(
        await capturePreviewFrame(video, seekTime, {
          maxWidth: options.maxWidth,
          signal: options.signal,
          onTiming: options.onTiming,
        }),
      )
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      const failure = error as SeekFailureError
      console.warn('[videoDomUtils] generateThumbnails failed', {
        time: seekTime,
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

  return frames
}
