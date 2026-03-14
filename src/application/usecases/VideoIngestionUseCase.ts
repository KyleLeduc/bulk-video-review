import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'

export interface VideoIngestionProgress {
  total: number
  scanned: number
  existingCount: number
  newCount: number
  knownErrorCount: number
  createdCount: number
  failedCount: number
  completedCount: number
}

export type VideoIngestionEvent =
  | { type: 'video'; video: ParsedVideo }
  | { type: 'progress'; progress: VideoIngestionProgress }

export interface VideoIngestionUseCase {
  execute(items: VideoImportItem[]): AsyncGenerator<VideoIngestionEvent>
}
