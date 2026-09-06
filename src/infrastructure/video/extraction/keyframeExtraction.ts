import {
  keyframeTargets,
  KEYFRAME_WIDTH,
} from '../../../domain/services/videoPreviewPolicy'
import {
  checkDimensions,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  type ExtractionOutput,
} from './previewExtraction'

export type KeyframeRequest = {
  kind: 'keyframes'
  duration: number
  maxWidth: number
}
export const KEYFRAME_READ_BYTES = 1024 * 1024 * 1024

export function prepareKeyframes(
  duration: number,
  width: number,
  height: number,
  maxWidth = KEYFRAME_WIDTH,
) {
  const targets = keyframeTargets(duration)
  if (!targets.length || ![120, 160, 240].includes(maxWidth))
    throw new ExtractionError('invalid-metadata')
  checkDimensions(width, height)
  const scale = Math.min(1, maxWidth / width)
  return {
    targets,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function validateKeyframeOutput(
  value: unknown,
  duration: number,
  maxWidth: number,
): ExtractionOutput {
  const output = value as ExtractionOutput | undefined
  const count = keyframeTargets(duration).length
  if (!output || !count || ![120, 160, 240].includes(maxWidth))
    throw new ExtractionError('output-invalid')
  try {
    checkDimensions(output.width, output.height)
  } catch {
    throw new ExtractionError('output-invalid')
  }
  if (
    output.width > maxWidth ||
    !Array.isArray(output.frames) ||
    output.frames.length !== count ||
    !output.frames.every(
      (blob) =>
        blob instanceof Blob && blob.type === 'image/jpeg' && blob.size > 0,
    ) ||
    output.frames.reduce((n, blob) => n + blob.size, 0) > MAX_OUTPUT_BYTES ||
    ![output.readBytes, output.readCalls].every(
      (n) => n !== null && Number.isSafeInteger(n) && n > 0,
    ) ||
    output.readBytes! < output.readCalls! ||
    output.readBytes! > KEYFRAME_READ_BYTES
  )
    throw new ExtractionError('output-invalid')
  return output
}
