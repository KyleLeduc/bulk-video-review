import { FileVideoParser } from '@/domain'
import { VideoMetadataService } from './VideoMetadataService'
import type { ParsedVideo } from '@/types'

export async function* parseFileList(files: FileList) {
  const startTime = performance.now()
  const parser = new FileVideoParser()
  const storage = VideoMetadataService.getInstance()

  const processFile = async (file: File) => {
    try {
      // try to get the video from storage
      let videoDto = await storage.getVideo(await parser.generateHash(file))

      if (!videoDto) {
        // if we didn't find a video, create
        const newVideoDto = await parser.transformVideoData(file)

        if (newVideoDto) {
          videoDto = await storage.postVideo(newVideoDto)
        } else {
          // we didn't find a video and couldn't create a new VideoEntity
          return null
        }
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

  const fileList = Array.from(files)

  const batchSize = 10 // Adjust batch size as needed
  for (let i = 0; i < fileList.length; i += batchSize) {
    const batchFiles = fileList.slice(i, i + batchSize)

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
