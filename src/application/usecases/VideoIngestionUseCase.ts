import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'

export type VideoIngestionPhase =
  | 'identifying'
  | 'classifying'
  | 'ingesting-fresh'
  | 'ingesting-retries'
  | 'complete'

export interface VideoIngestionOptions {
  concurrency?: number
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
