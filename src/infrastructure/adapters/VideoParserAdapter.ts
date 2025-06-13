import { VideoFileParser } from '@infra/video'
import type { IVideoParser } from '@app/ports'
import type { ParsedVideo } from '@domain/entities'
import type { IVideoFacade } from '@domain/repositories'

export class VideoParserAdapter implements IVideoParser {
  constructor(
    private readonly storage: IVideoFacade,
    private readonly parser: VideoFileParser = new VideoFileParser(),
  ) {}

  async *parseFileList(files: FileList): AsyncGenerator<ParsedVideo> {
    const startTime = performance.now()

    const { filesToProcess, foundVideos } =
      await this.#filterExistingFromNewVideos(files)

    for (const video of foundVideos) {
      yield video
    }

    if (filesToProcess.length > 0) {
      for (const file of filesToProcess) {
        try {
          const videoItem = await this.#processFile(file)

          if (videoItem) yield videoItem
        } catch (e) {
          console.error('Failed to process file:', e)
        }
      }
    }

    const endTime = performance.now()
    console.log(`Total time taken: ${endTime - startTime} milliseconds`)
  }

  readonly #processFile = async (file: File) => {
    try {
      const result = await this.parser.transformVideoData(file)
      if (!result) return null

      const { videoEntity, url } = result

      if (videoEntity) {
        const videoDto = await this.storage.postVideo(videoEntity)
        return {
          ...videoDto,
          url,
          pinned: false,
        }
      }

      return null
    } catch (e) {
      console.error('file input error', e)

      return null
    }
  }

  readonly #filterExistingFromNewVideos = async (fileList: FileList) => {
    const foundVideos: ParsedVideo[] = []
    const filesToProcess: File[] = []

    for (const file of fileList) {
      const videoEntity = await this.storage.getVideo(
        await this.parser.generateHash(file),
      )

      if (videoEntity) {
        foundVideos.push({
          ...videoEntity,
          url: URL.createObjectURL(file),
          pinned: false,
        })
      } else {
        filesToProcess.push(file)
      }
    }

    return { foundVideos, filesToProcess }
  }
}
