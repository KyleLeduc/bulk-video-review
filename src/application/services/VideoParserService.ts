import { FileVideoParser } from '@/domain'
import { VideoMetadataService } from './VideoMetadataService'
import type { ParsedVideo } from '@/domain'

export async function* parseFileList(
  files: FileList,
): AsyncGenerator<ParsedVideo> {
  const startTime = performance.now()
  const parser = new FileVideoParser()
  const storage = VideoMetadataService.getInstance()

  const { filesToProcess, foundVideos } = await filterExistingFromNewVideos(
    files,
    storage,
    parser,
  )

  for (const video of foundVideos) {
    yield video
  }

  if (filesToProcess.length > 0) {
    for await (const video of processVideoFiles(
      filesToProcess,
      storage,
      parser,
    )) {
      yield video
    }
  }

  const endTime = performance.now()
  console.log(`Total time taken: ${endTime - startTime} milliseconds`)
}

const processVideoFiles = async function* (
  fileArray: File[],
  storage: VideoMetadataService,
  parser: FileVideoParser,
) {
  const processFile = async (file: File) => {
    try {
      const newVideoDto = await parser.transformVideoData(file)

      if (newVideoDto) {
        const videoDto = await storage.postVideo(newVideoDto)
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

  for (const file of fileArray) {
    try {
      const video = await processFile(file)

      if (video) yield video
    } catch (e) {
      console.error('Failed to process file:', e)
    }
  }
}

const filterExistingFromNewVideos = async (
  fileList: FileList,
  storage: VideoMetadataService,
  parser: FileVideoParser,
) => {
  const foundVideos = []
  const filesToProcess = []

  for (const file of fileList) {
    const videoEntity = await storage.getVideo(await parser.generateHash(file))

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
