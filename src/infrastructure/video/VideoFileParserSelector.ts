import type { ExtractVideoMetadataOptions } from '@app/ports'
import type { IVideoFileParser } from './IVideoFileParser'

type ShouldUseFfmpeg = () => boolean

export class VideoFileParserSelector implements IVideoFileParser {
  constructor(
    private readonly domParser: IVideoFileParser,
    private readonly ffmpegParser: IVideoFileParser,
    private readonly shouldUseFfmpeg: ShouldUseFfmpeg = () => false,
  ) {}

  private getParser(): IVideoFileParser {
    return this.shouldUseFfmpeg() ? this.ffmpegParser : this.domParser
  }

  generateHash(file: File): Promise<string> {
    return this.getParser().generateHash(file)
  }

  transformVideoData(
    file: File,
    options?: ExtractVideoMetadataOptions,
  ): ReturnType<IVideoFileParser['transformVideoData']> {
    return this.getParser().transformVideoData(file, options)
  }
}
