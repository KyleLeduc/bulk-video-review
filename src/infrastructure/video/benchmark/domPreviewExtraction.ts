import {
  capturePreviewFrame,
  disposeVideoElement,
  loadVideoElement,
  seekToTime,
} from '../services/videoDomUtils'

import {
  prepareTargets,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  validateExtraction,
  emptyMetrics,
  checkPreviewCount,
  type PreviewCount,
  type PreparedExtraction,
  type ExtractionOutput,
} from '../extraction/previewExtraction'
import { prepareKeyframes } from '../extraction/keyframeExtraction'

/** Player duration for production-recipe probes; no still-sampling policy. */
export async function readPlayerDuration(
  file: File,
  signal: AbortSignal,
): Promise<number> {
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new ExtractionError('invalid-metadata')
    return video.duration
  } finally {
    disposeVideoElement(video)
    URL.revokeObjectURL(url)
  }
}

export async function prepareFile(
  file: File,
  signal: AbortSignal,
  count: PreviewCount = 9,
): Promise<PreparedExtraction> {
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    return prepareTargets(
      video.duration,
      video.videoWidth,
      video.videoHeight,
      count,
    )
  } finally {
    disposeVideoElement(video)
    URL.revokeObjectURL(url)
  }
}
export async function extractWithDom(
  file: File,
  prepared: PreparedExtraction,
  signal: AbortSignal,
): Promise<ExtractionOutput> {
  const count = prepared.targets.length
  checkPreviewCount(count)
  const output = await extractDomFrames(file, signal, 480, (video) => {
    const current = prepareTargets(
      video.duration,
      video.videoWidth,
      video.videoHeight,
      count,
    )
    if (JSON.stringify(current) !== JSON.stringify(prepared))
      throw new ExtractionError('invalid-metadata')
    return current
  })
  return validateExtraction(output, prepared)
}

/** Same production seek targets and JPEG recipe, using the native player. */
export function extractKeyframesWithDom(
  file: File,
  duration: number,
  signal: AbortSignal,
  maxWidth = 160,
): Promise<ExtractionOutput> {
  return extractDomFrames(file, signal, maxWidth, (video) => {
    if (video.duration !== duration)
      throw new ExtractionError('invalid-metadata')
    return prepareKeyframes(
      duration,
      video.videoWidth,
      video.videoHeight,
      maxWidth,
    )
  })
}

/** Metadata and a no-op seek at zero do not guarantee drawable frame data. */
async function waitForFrameData(
  video: HTMLVideoElement,
  signal: AbortSignal,
  initialSeek?: number,
) {
  signal.throwIfAborted()
  if (video.error) throw new ExtractionError('extraction-failed')
  let sought = initialSeek === undefined
  const ready = () => sought && video.readyState >= 2 && !video.seeking
  if (ready()) return
  await new Promise<void>((resolve, reject) => {
    const preload = video.preload
    const cleanup = () => {
      clearTimeout(timeout)
      for (const event of ['loadeddata', 'canplay'])
        video.removeEventListener(event, onReady)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeEventListener('abort', onError)
      signal.removeEventListener('abort', onAbort)
      video.preload = preload
    }
    const onReady = () => {
      if (!ready()) return
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new ExtractionError('extraction-failed'))
    }
    const onSeeked = () => {
      sought = true
      onReady()
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const timeout = setTimeout(onError, 10_000)
    for (const event of ['loadeddata', 'canplay'])
      video.addEventListener(event, onReady)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.addEventListener('abort', onError)
    signal.addEventListener('abort', onAbort, { once: true })
    video.preload = 'auto'
    // Chrome can expose HAVE_ENOUGH_DATA yet draw no initial paused frame.
    // Explicitly seek even at zero, without shifting the requested timestamp.
    try {
      if (initialSeek !== undefined) video.currentTime = initialSeek
    } catch {
      onError()
      return
    }
    onReady()
  })
}

async function extractDomFrames(
  file: File,
  signal: AbortSignal,
  maxWidth: number,
  prepare: (video: HTMLVideoElement) => PreparedExtraction,
): Promise<ExtractionOutput> {
  signal.throwIfAborted()
  const started = performance.now()
  const metrics = emptyMetrics()
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    signal.throwIfAborted()
    const current = prepare(video)
    metrics.setupMs = performance.now() - started
    const frames: Blob[] = []
    let outputBytes = 0
    for (const target of current.targets) {
      const seekStarted = performance.now()
      const initialSeek =
        frames.length === 0 &&
        Math.abs(video.currentTime - target) < 0.01 &&
        !video.seeking
          ? target
          : undefined
      await seekToTime(video, target, { signal })
      await waitForFrameData(video, signal, initialSeek)
      signal.throwIfAborted()
      metrics.extractionMs += performance.now() - seekStarted
      const frame = await capturePreviewFrame(video, target, {
        signal,
        maxWidth,
        onTiming: ({ phase, durationMs }) => {
          if (phase === 'encode') metrics.encodeMs += durationMs
          else if (phase === 'capture') metrics.extractionMs += durationMs
        },
      })
      signal.throwIfAborted()
      outputBytes += frame.blob.size
      if (
        frame.blob.type !== 'image/jpeg' ||
        frame.blob.size <= 0 ||
        frame.width !== current.width ||
        frame.height !== current.height ||
        outputBytes > MAX_OUTPUT_BYTES
      )
        throw new ExtractionError('output-invalid')
      frames.push(frame.blob)
    }
    return {
      metrics,
      frames,
      width: current.width,
      height: current.height,
      readBytes: null,
      readCalls: null,
    }
  } finally {
    const cleanupStarted = performance.now()
    disposeVideoElement(video)
    URL.revokeObjectURL(url)
    metrics.cleanupMs = performance.now() - cleanupStarted
    metrics.totalMs = performance.now() - started
  }
}
