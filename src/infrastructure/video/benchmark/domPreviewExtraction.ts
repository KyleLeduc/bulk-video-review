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
  type PreparedExtraction,
  type ExtractionOutput,
} from './previewExtraction'

export async function prepareFile(
  file: File,
  signal: AbortSignal,
): Promise<PreparedExtraction> {
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    return prepareTargets(video.duration, video.videoWidth, video.videoHeight)
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
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideoElement(url, { signal })
    const current = prepareTargets(
      video.duration,
      video.videoWidth,
      video.videoHeight,
    )
    if (JSON.stringify(current) !== JSON.stringify(prepared))
      throw new ExtractionError('invalid-metadata')
    const frames: Blob[] = []
    for (const target of prepared.targets) {
      await seekToTime(video, target, { signal })
      const frame = await capturePreviewFrame(video, target, {
        signal,
        maxWidth: 480,
      })
      frames.push(frame.blob)
      if (frames.reduce((n, blob) => n + blob.size, 0) > MAX_OUTPUT_BYTES)
        throw new ExtractionError('output-invalid')
    }
    return validateExtraction(
      {
        frames,
        width: current.width,
        height: current.height,
        readBytes: null,
        readCalls: null,
      },
      prepared,
    )
  } finally {
    disposeVideoElement(video)
    URL.revokeObjectURL(url)
  }
}
