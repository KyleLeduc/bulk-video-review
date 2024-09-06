import type { VideoStorageDto, VideoEntity, VideoMetadataEntity } from '@/types'
import { MetadataRepository, VideoRepository } from '@/infrastructure'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataService {
  private static instance: VideoMetadataService

  private constructor(
    private metadataRepo: MetadataRepository,
    private videoRepo: VideoRepository,
  ) {}

  public static getInstance(): VideoMetadataService {
    if (!VideoMetadataService.instance) {
      const metadataRepo = new MetadataRepository()
      const videoRepo = new VideoRepository()

      VideoMetadataService.instance = new VideoMetadataService(
        metadataRepo,
        videoRepo,
      )
    }

    return VideoMetadataService.instance
  }

  /**
   * Gets the video w/ a matching id
   * @param id id of the video
   * @returns video or undefined
   */
  async getVideo(id: string): Promise<VideoStorageDto | undefined> {
    const videoData = await this.videoRepo.getVideo(id)
    const metadata = await this.metadataRepo.getMetadata(id)

    if (!videoData) return undefined
    return { ...videoData, ...metadata }
  }

  async postVideo(videoMetadata: VideoEntity): Promise<VideoStorageDto> {
    const { id } = videoMetadata
    const metadata = await this.metadataRepo.upsertMetadata({
      id,
      votes: 0,
    })

    const videoEntity = await this.videoRepo.postVideo(videoMetadata)

    return { ...videoEntity, ...metadata }
  }

  async updateVotes(
    id: string,
    delta: number,
  ): Promise<VideoMetadataEntity | null> {
    try {
      const metadata = await this.metadataRepo.getMetadata(id)

      if (metadata) {
        metadata.votes += delta

        return await this.metadataRepo.upsertMetadata(metadata)
      }

      return null
    } catch (e) {
      console.error(e)

      return null
    }
  }
}

export { VideoMetadataService }
