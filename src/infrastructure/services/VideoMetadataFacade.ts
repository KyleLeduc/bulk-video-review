import type {
  VideoStorageDto,
  VideoEntity,
  MetadataEntity,
  IVideoFacade,
} from '@/domain'
import {
  MetadataRepository,
  VideoRepository,
} from '@/infrastructure/repository'
import { VideoStorageDtoMapper } from '@/domain'

/**
 * IndexedDb bridge to handle storing video metadata
 */
export class VideoMetadataFacade implements IVideoFacade {
  private static instance: VideoMetadataFacade

  private constructor(
    private readonly metadataRepo: MetadataRepository,
    private readonly videoRepo: VideoRepository,
  ) {}

  public static getInstance(): VideoMetadataFacade {
    if (!VideoMetadataFacade.instance) {
      const metadataRepo = new MetadataRepository()
      const videoRepo = new VideoRepository()

      VideoMetadataFacade.instance = new VideoMetadataFacade(
        metadataRepo,
        videoRepo,
      )
    }

    return VideoMetadataFacade.instance
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

  async updateVideo(
    video: VideoStorageDto,
  ): Promise<VideoStorageDto | undefined> {
    const videoData = await this.videoRepo.postVideo(video)
    const metadata = await this.metadataRepo.getMetadata(video.id)

    if (!videoData) return undefined
    return VideoStorageDtoMapper.toDto(videoData, metadata)
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
