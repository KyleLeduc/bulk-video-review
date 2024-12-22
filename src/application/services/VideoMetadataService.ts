import type { VideoStorageDto, VideoEntity, MetadataEntity } from '@/domain'
import { MetadataRepository, VideoRepository } from '@/infrastructure'
import { VideoStorageDtoMapper } from './VideoStorageDtoMapper'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataService {
  private static instance: VideoMetadataService

  private constructor(
    private readonly metadataRepo: MetadataRepository,
    private readonly videoRepo: VideoRepository,
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
    return VideoStorageDtoMapper.toDto(videoData, metadata)
  }

  async postVideo(videoMetadata: VideoEntity): Promise<VideoStorageDto> {
    const { id } = videoMetadata
    const metadata = await this.metadataRepo.upsertMetadata({
      id,
      votes: 0,
    })

    const videoEntity = await this.videoRepo.postVideo(videoMetadata)

    return VideoStorageDtoMapper.toDto(videoEntity, metadata)
  }

  async updateVotes(id: string, delta: number): Promise<MetadataEntity | null> {
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

  async wipeData(): Promise<void> {
    const metadata = await this.metadataRepo.getAllMetadata()
    const videos = await this.videoRepo.getAllVideos()

    await Promise.all(
      metadata.map((m) => this.metadataRepo.deleteMetadata(m.id)),
    )
    await Promise.all(videos.map((v) => this.videoRepo.deleteVideo(v.id)))
  }
}

export { VideoMetadataService }
