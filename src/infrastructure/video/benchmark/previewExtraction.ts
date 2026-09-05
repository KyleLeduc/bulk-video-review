export const EXTRACTION_DEADLINE_MS = 120000
export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
export const MAX_READ_BYTES = 256 * 1024 * 1024
export type PreparedExtraction = {
  targets: number[]
  width: number
  height: number
}
export type ExtractionOutput = {
  frames: Blob[]
  width: number
  height: number
  readBytes: number | null
  readCalls: number | null
}
const reasons = [
  'unsupported',
  'invalid-metadata',
  'read-limit',
  'output-invalid',
  'deadline',
  'extraction-failed',
] as const
export type FailureReason = (typeof reasons)[number] | 'aborted'
export class ExtractionError extends Error {
  constructor(public readonly reason: (typeof reasons)[number]) {
    super(reason)
  }
}
export function safeFailure(error: unknown): FailureReason {
  if (error instanceof DOMException && error.name === 'AbortError')
    return 'aborted'
  return error instanceof ExtractionError ? error.reason : 'extraction-failed'
}
export function workerFailure(reason: unknown): ExtractionError {
  return new ExtractionError(
    reasons.includes(reason as (typeof reasons)[number])
      ? (reason as (typeof reasons)[number])
      : 'extraction-failed',
  )
}
export function checkDimensions(width: number, height: number) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192) ||
    width * height > 33554432
  )
    throw new ExtractionError('invalid-metadata')
}
export function prepareTargets(
  duration: number,
  width: number,
  height: number,
): PreparedExtraction {
  checkDimensions(width, height)
  if (!Number.isFinite(duration) || duration <= 0)
    throw new ExtractionError('invalid-metadata')
  const scale = Math.min(1, 480 / width)
  return {
    targets: Array.from({ length: 9 }, (_, i) =>
      Math.floor((duration / 10) * (i + 1)),
    ),
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
export function validateExtraction(
  value: unknown,
  prepared: PreparedExtraction,
): ExtractionOutput {
  const output = value as ExtractionOutput | undefined
  if (
    !output ||
    output.width !== prepared.width ||
    output.height !== prepared.height ||
    !Array.isArray(output.frames) ||
    output.frames.length !== 9 ||
    !output.frames.every(
      (blob) =>
        blob instanceof Blob && blob.type === 'image/jpeg' && blob.size > 0,
    ) ||
    output.frames.reduce((n, blob) => n + blob.size, 0) > MAX_OUTPUT_BYTES ||
    ![output.readBytes, output.readCalls].every(
      (n) => n === null || (Number.isSafeInteger(n) && n >= 0),
    ) ||
    (output.readBytes !== null && output.readBytes > MAX_READ_BYTES)
  )
    throw new ExtractionError('output-invalid')
  return output
}
