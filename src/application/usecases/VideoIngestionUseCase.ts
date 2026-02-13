import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'

export interface VideoIngestionUseCase {
  execute(items: VideoImportItem[]): AsyncGenerator<ParsedVideo>
}
