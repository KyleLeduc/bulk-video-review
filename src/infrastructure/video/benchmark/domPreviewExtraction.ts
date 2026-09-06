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
} from './previewExtraction'

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
  const started = performance.now()
  const metrics = emptyMetrics()
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    const current = prepareTargets(
      video.duration,
      video.videoWidth,
      video.videoHeight,
      count,
    )
    if (JSON.stringify(current) !== JSON.stringify(prepared))
      throw new ExtractionError('invalid-metadata')
    metrics.setupMs = performance.now() - started
    const frames: Blob[] = []
    for (const target of prepared.targets) {
      const seekStarted = performance.now()
      await seekToTime(video, target, { signal })
      metrics.extractionMs += performance.now() - seekStarted
      const frame = await capturePreviewFrame(video, target, {
        signal,
        maxWidth: 480,
        onTiming: ({ phase, durationMs }) => {
          if (phase === 'encode') metrics.encodeMs += durationMs
          else if (phase === 'capture') metrics.extractionMs += durationMs
        },
      })
      frames.push(frame.blob)
      if (frames.reduce((n, blob) => n + blob.size, 0) > MAX_OUTPUT_BYTES)
        throw new ExtractionError('output-invalid')
    }
    return validateExtraction(
      {
        metrics,
        frames,
        width: current.width,
        height: current.height,
        readBytes: null,
        readCalls: null,
      },
      prepared,
    )
  } finally {
    const cleanupStarted = performance.now()
    disposeVideoElement(video)
    URL.revokeObjectURL(url)
    metrics.cleanupMs = performance.now() - cleanupStarted
    metrics.totalMs = performance.now() - started
  }
}
