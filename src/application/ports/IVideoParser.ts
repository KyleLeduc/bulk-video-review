import type { ParsedVideo } from '@domain/entities'
import type { VideoImportItem } from '@domain/valueObjects'

export interface IVideoParser {
  parseItems(items: VideoImportItem[]): AsyncGenerator<ParsedVideo>
}
