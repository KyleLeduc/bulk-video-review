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

  const batchSize = 3
  for (let i = 0; i < filesToProcess.length; i += batchSize) {
    const batchFiles = filesToProcess.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batchFiles.map((file) => processFile(file)),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        yield result.value
      } else if (result.status === 'rejected') {
        console.error('Failed to process file in batch:', result.reason)
      }
    }
  }

  const endTime = performance.now()
  console.log(`Total time taken: ${endTime - startTime} milliseconds`)
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
