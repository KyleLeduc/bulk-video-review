import { FileVideoParser } from '@/domain'
import { VideoMetadataService } from './VideoMetadataService'
import type { ParsedVideo } from '@/domain'

export class FileParserService {
  constructor(
    private readonly storage = VideoMetadataService.getInstance(),
    private readonly parser = new FileVideoParser(),
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
          const video = await this.#processFile(file)

          if (video) yield video
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
      const newVideoDto = await this.parser.transformVideoData(file)

      if (newVideoDto) {
        const videoDto = await this.storage.postVideo(newVideoDto)
        return {
          ...videoDto,
          url: URL.createObjectURL(file),
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
    const foundVideos = []
    const filesToProcess = []

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
