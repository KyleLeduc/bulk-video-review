import type { ParsedVideo } from '@domain/entities'
import type { IVideoParser } from '@app/ports/IVideoParser'

export class AddVideosFromFilesUseCase {
  constructor(private readonly parser: IVideoParser) {}

  execute(files: FileList): AsyncGenerator<ParsedVideo> {
    return this.parser.parseFileList(files)
  }
}
