import type {
  VideoProcessingOutcome,
  VideoProcessingPhase,
  VideoProcessingTimingObserver,
} from '@app/ports/VideoProcessingTiming'

const failureOutcome = (error: unknown): VideoProcessingOutcome =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'AbortError'
    ? 'aborted'
    : 'failed'

const startTiming = (
  phase: VideoProcessingPhase,
  onTiming: VideoProcessingTimingObserver,
) => {
  const startedAt = performance.now()
  return (outcome: VideoProcessingOutcome) => {
    const durationMs = Math.max(0, performance.now() - startedAt)
    try {
      onTiming({ phase, durationMs, outcome })
    } catch (error) {
      // Diagnostics must not replace media/persistence results or errors.
      console.warn('[video-processing] Timing observer failed', error)
    }
  }
}

export async function measureVideoProcessing<T>(
  phase: VideoProcessingPhase,
  operation: () => Promise<T>,
  onTiming?: VideoProcessingTimingObserver,
): Promise<T> {
  if (!onTiming) return operation()
  const finish = startTiming(phase, onTiming)
  let outcome: VideoProcessingOutcome = 'completed'
  try {
    return await operation()
  } catch (error) {
    outcome = failureOutcome(error)
    throw error
  } finally {
    finish(outcome)
  }
}

/** Canvas draw/resize must not gain an asynchronous yield from measurement. */
export function measureVideoProcessingSync<T>(
  phase: VideoProcessingPhase,
  operation: () => T,
  onTiming?: VideoProcessingTimingObserver,
): T {
  if (!onTiming) return operation()
  const finish = startTiming(phase, onTiming)
  let outcome: VideoProcessingOutcome = 'completed'
  try {
    return operation()
  } catch (error) {
    outcome = failureOutcome(error)
    throw error
  } finally {
    finish(outcome)
  }
}
