import { FileVideoParser } from '@/domain'
import { VideoMetadataService } from './VideoMetadataService'
import type { ParsedVideo, VideoStorageDto } from '@/types'

export async function* parseFileList(files: FileList) {
  const startTime = performance.now()
  const parser = new FileVideoParser()
  const storage = VideoMetadataService.getInstance()

  const processFile = async (file: File) => {
    try {
      let videoDto
      const newVideoDto = await parser.transformVideoData(file)

      if (newVideoDto) {
        videoDto = await storage.postVideo(newVideoDto)
      } else {
        // we didn't find a video and couldn't create a new VideoEntity
        return null
      }

      const parsedVideo: ParsedVideo = {
        ...videoDto,
        url: URL.createObjectURL(file),
        pinned: false,
      }

      return parsedVideo
    } catch (e) {
      console.error('file input error', e)
    }
  }

  const filesToProcess: File[] = []
  const foundVideoEntities: { videoEntity: VideoStorageDto; file: File }[] = []

  const fileList = Array.from(files)

  for (const file of fileList) {
    // sort videos by already processed and new
    const videoEntity = await storage.getVideo(await parser.generateHash(file))

    if (videoEntity) {
      foundVideoEntities.push({ videoEntity, file })
    } else {
      filesToProcess.push(file)
    }
  }

  for (const { videoEntity, file } of foundVideoEntities) {
    const parsedVideo: ParsedVideo = {
      ...videoEntity,
      url: URL.createObjectURL(file),
      pinned: false,
    }
    yield parsedVideo
  }

  const batchSize = 3 // Adjust batch size as needed
  for (let i = 0; i < filesToProcess.length; i += batchSize) {
    const batchFiles = filesToProcess.slice(i, i + batchSize)

    const batchPromises = batchFiles.map((file) => processFile(file))

    const results = await Promise.allSettled(batchPromises)

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        yield result.value
      }
    }
  }

  const endTime = performance.now()
  console.log(`Total time taken: ${endTime - startTime} milliseconds`)
}
