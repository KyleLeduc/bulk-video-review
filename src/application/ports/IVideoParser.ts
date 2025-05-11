import type { ParsedVideo } from '@domain/entities'

export interface IVideoParser {
  parseFileList(files: FileList): AsyncGenerator<ParsedVideo>
}
