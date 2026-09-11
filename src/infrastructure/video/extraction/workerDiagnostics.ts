import type {
  VideoPreviewDiagnostic,
  VideoPreviewProgress,
} from '@app/ports/IVideoPreviewGenerator'

export function safeDiagnostics(value: unknown): VideoPreviewDiagnostic {
  const result: VideoPreviewDiagnostic = {}
  if (!value || typeof value !== 'object') return result
  const data = value as Record<string, unknown>
  if (data.cleanupFailed === true) result.cleanupFailed = true
  if (
    typeof data.stage === 'string' &&
    ['setup', 'metadata', 'timeline', 'decode', 'encode', 'cleanup'].includes(
      data.stage,
    )
  )
    result.stage = data.stage as VideoPreviewDiagnostic['stage']
  if (
    typeof data.errorName === 'string' &&
    [
      'Error',
      'TypeError',
      'RangeError',
      'NotSupportedError',
      'EncodingError',
      'DataError',
      'NotReadableError',
      'InvalidStateError',
      'AbortError',
      'QuotaExceededError',
    ].includes(data.errorName)
  )
    result.errorName = data.errorName as string
  if (
    typeof data.codec === 'string' &&
    ['avc', 'hevc', 'vp8', 'vp9', 'av1'].includes(data.codec)
  )
    result.codec = data.codec as string
  if (
    typeof data.timelineReason === 'string' &&
    [
      'unsupported-edit-list',
      'invalid-timing',
      'leading-gap',
      'track-ends-before-player',
    ].includes(data.timelineReason)
  )
    result.timelineReason =
      data.timelineReason as VideoPreviewDiagnostic['timelineReason']
  for (const key of [
    'trackStart',
    'trackEnd',
    'storedDuration',
    'timeResolution',
    'readBytes',
    'readCalls',
    'elapsedMs',
    'outputBytes',
  ] as const) {
    const n = data[key]
    if (
      typeof n === 'number' &&
      Number.isFinite(n) &&
      (key === 'trackStart' || n >= 0)
    )
      result[key] = n
  }
  return result
}

/** Shared worker-message boundary; stale, regressive and invalid counts are ignored. */
export function progressReceiver(
  total: number,
  observe?: (progress: VideoPreviewProgress) => void,
) {
  let completed = -1
  return (data: VideoPreviewProgress) => {
    if (
      !observe ||
      !Number.isInteger(data.completed) ||
      data.completed < 0 ||
      data.completed <= completed ||
      data.completed > total ||
      data.total !== total
    )
      return
    completed = data.completed
    observe({
      completed,
      total,
      diagnostics: safeDiagnostics(data.diagnostics),
    })
  }
}
