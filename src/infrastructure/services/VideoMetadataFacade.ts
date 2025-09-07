import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { IVideoFacade } from '@domain/repositories'
import type {
  IMetadataRepository,
  IVideoRepository,
} from '@domain/repositories'
import type { ILogger } from '@app/ports'
import { VideoStorageDtoMapper } from '../dto/VideoStorageDtoMapper'

/**
 * IndexedDb bridge to handle storing video metadata
 */
export class VideoMetadataFacade implements IVideoFacade {
  constructor(
    private readonly metadataRepo: IMetadataRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly logger: ILogger,
  ) {}

  /**
   * Gets the video w/ a matching id
   * @param id id of the video
   * @returns video or undefined
   */
  async getVideo(
    id: string,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    const videoData = await this.videoRepo.getVideo(id)
    const metadata = await this.metadataRepo.getMetadata(id)

    if (!videoData) return undefined
    return VideoStorageDtoMapper.toDto(videoData, metadata)
  }

  async postVideo(
    videoMetadata: VideoEntity,
  ): Promise<VideoEntity & MetadataEntity> {
    const { id } = videoMetadata
    const metadata = await this.metadataRepo.upsertMetadata({
      id,
      votes: 0,
    })

    const videoEntity = await this.videoRepo.postVideo(videoMetadata)

    return VideoStorageDtoMapper.toDto(videoEntity, metadata)
  }

  async updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
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
      this.logger.error('Failed to update votes', e)

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
