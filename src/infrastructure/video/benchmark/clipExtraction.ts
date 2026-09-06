import {
  checkDimensions,
  ExtractionError,
  MAX_OUTPUT_BYTES,
} from './previewExtraction'

export const CLIP_SECONDS = 3
export const CLIP_FPS = 10
export const CLIP_READ_BYTES = 1024 * 1024 * 1024
export const MAX_CLIP_BYTES = 2 * 1024 * 1024
export type ClipWindow = { start: number; end: number }
export type ClipOutput = {
  clips: { blob: Blob; start: number; duration: number }[]
  width: number
  height: number
  codec: 'avc' | 'vp8'
  readBytes: number
  readCalls: number
  metrics: {
    setupMs: number
    conversionMs: number
    firstClipMs: number
    totalMs: number
    readMs: number
    readMaxMs: number
  }
}

export function clipWindows(duration: number): ClipWindow[] {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new ExtractionError('invalid-metadata')
  const count = Math.min(10, Math.max(1, Math.floor(duration / CLIP_SECONDS)))
  return Array.from({ length: count }, (_, i) => {
    const start = (duration / count) * i
    return { start, end: Math.min(duration, start + CLIP_SECONDS) }
  })
}

export function clipDimensions(width: number, height: number) {
  checkDimensions(width, height)
  const scale = Math.min(1, 320 / Math.max(width, height))
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  }
}

// A fixed, small output buffer supports muxer backpatches without retaining arbitrary chunks.
// This bounds our output storage, not allocations inside the parser or codecs.
export function boundedClipBuffer(limit: number) {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_CLIP_BYTES)
    throw new ExtractionError('output-invalid')
  const bytes = new Uint8Array(limit)
  let length = 0
  return {
    write({ position, data }: { position: number; data: Uint8Array }) {
      if (
        !Number.isSafeInteger(position) ||
        position < 0 ||
        position + data.byteLength > limit
      )
        throw new ExtractionError('output-invalid')
      bytes.set(data, position)
      length = Math.max(length, position + data.byteLength)
    },
    blob(type: string) {
      return new Blob([bytes.subarray(0, length)], { type })
    },
  }
}

export function validateClipOutput(value: unknown): ClipOutput {
  const output = value as ClipOutput | undefined
  if (
    !output ||
    !['avc', 'vp8'].includes(output.codec) ||
    !Array.isArray(output.clips) ||
    !output.clips.length ||
    output.clips.length > 10
  )
    throw new ExtractionError('output-invalid')
  if (
    ![output.width, output.height].every(
      (n) => Number.isInteger(n) && n >= 2 && n <= 320 && n % 2 === 0,
    )
  )
    throw new ExtractionError('output-invalid')
  if (
    !output.clips.every(
      (clip, i, clips) =>
        clip &&
        clip.blob instanceof Blob &&
        clip.blob.type ===
          (output.codec === 'avc' ? 'video/mp4' : 'video/webm') &&
        clip.blob.size > 0 &&
        clip.blob.size <= MAX_CLIP_BYTES &&
        Number.isFinite(clip.start) &&
        clip.start >= 0 &&
        Number.isFinite(clip.duration) &&
        clip.duration > 0 &&
        clip.duration <= CLIP_SECONDS + 1e-6 &&
        (i === 0 ||
          clip.start >= clips[i - 1].start + clips[i - 1].duration - 1e-6),
    )
  )
    throw new ExtractionError('output-invalid')
  if (
    output.clips.reduce((n, c) => n + c.blob.size, 0) > MAX_OUTPUT_BYTES ||
    !Number.isSafeInteger(output.readBytes) ||
    output.readBytes <= 0 ||
    output.readBytes > CLIP_READ_BYTES ||
    !Number.isSafeInteger(output.readCalls) ||
    output.readCalls <= 0 ||
    output.readCalls > output.readBytes
  )
    throw new ExtractionError('output-invalid')
  if (
    !output.metrics ||
    ![
      'setupMs',
      'conversionMs',
      'firstClipMs',
      'totalMs',
      'readMs',
      'readMaxMs',
    ].every((key) => {
      const n = output.metrics[key as keyof ClipOutput['metrics']]
      return Number.isFinite(n) && n >= 0
    }) ||
    output.metrics.firstClipMs > output.metrics.totalMs
  )
    throw new ExtractionError('output-invalid')
  return output
}
