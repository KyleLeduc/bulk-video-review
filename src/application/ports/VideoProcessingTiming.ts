export type VideoProcessingPhase =
  | 'metadata'
  | 'seek'
  | 'capture'
  | 'encode'
  | 'serialize'
  | 'persistence'

export type VideoProcessingOutcome = 'completed' | 'failed' | 'aborted'

/** One settled operation, not a wall-clock pipeline duration. No file data. */
export type VideoProcessingTiming = {
  phase: VideoProcessingPhase
  durationMs: number
  outcome: VideoProcessingOutcome
}

export type VideoProcessingTimingObserver = (
  timing: VideoProcessingTiming,
) => void
