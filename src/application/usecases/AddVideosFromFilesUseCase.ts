import type { ParsedVideo } from '@domain/entities'
import type { IVideoParser } from '@app/ports'
import type { VideoImportItem } from '@domain/valueObjects'

export class AddVideosFromFilesUseCase {
  constructor(private readonly parser: IVideoParser) {}

  execute(items: VideoImportItem[]): AsyncGenerator<ParsedVideo> {
    return this.parser.parseItems(items)
  }
}
