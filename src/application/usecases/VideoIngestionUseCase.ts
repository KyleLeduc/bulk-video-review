import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'
import type { VideoProcessingTiming } from '@app/ports/VideoProcessingTiming'

export type VideoIngestionPhase =
  | 'identifying'
  | 'classifying'
  | 'ingesting-fresh'
  | 'ingesting-retries'
  | 'complete'

export interface VideoIngestionOptions {
  concurrency?: number
  onTiming?: (timing: VideoProcessingTiming & { videoId: string }) => void
  /** Optional session-only audit; retains an original that failed before a card existed. */
  onUnavailable?: (item: {
    videoId: string
    title: string
    reason: string
  }) => void
}

export interface VideoIngestionProgress {
  total: number
  scanned: number
  existingCount: number
  newCount: number
  knownErrorCount: number
  createdCount: number
  failedCount: number
  completedCount: number
  phase?: VideoIngestionPhase
  effectiveConcurrency?: number
  activeItemCount?: number
  pendingItemCount?: number
  phaseCompletedCount?: number
  phaseTotal?: number
  peakActiveItemCount?: number
  peakPendingItemCount?: number
  inputBytes?: number
  identificationElapsedMs?: number
  classificationElapsedMs?: number
  processingElapsedMs?: number
  elapsedMs?: number
  skippedCount?: number
  duplicateCount?: number
}

export type VideoIngestionEvent =
  | { type: 'video'; video: ParsedVideo }
  | { type: 'progress'; progress: VideoIngestionProgress }

export interface VideoIngestionUseCase {
  execute(
    items: VideoImportItem[],
    options?: VideoIngestionOptions,
  ): AsyncGenerator<VideoIngestionEvent>
}
