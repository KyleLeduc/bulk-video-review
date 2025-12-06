import type { ILogger } from '@app/ports'
import type {
  IMetadataRepository,
  IVideoAggregateRepository,
  IVideoRepository,
} from '@domain/repositories'
import type {
  MetadataEntity,
  VideoAggregate,
  VideoEntity,
} from '@domain/entities'
import { VideoAggregateMapper } from '@domain/mappers'

export class VideoAggregateRepository implements IVideoAggregateRepository {
  constructor(
    private readonly metadataRepository: IMetadataRepository,
    private readonly videoRepository: IVideoRepository,
    private readonly logger: ILogger,
  ) {}

  async getVideo(id: string): Promise<VideoAggregate | undefined> {
    const [video, metadata] = await Promise.all([
      this.videoRepository.getVideo(id),
      this.metadataRepository.getMetadata(id),
    ])

    if (!video || !metadata) {
      return undefined
    }

    return VideoAggregateMapper.fromEntities(video, metadata)
  }

  async getAllVideos(): Promise<VideoAggregate[]> {
    const [videos, metadata] = await Promise.all([
      this.videoRepository.getAllVideos(),
      this.metadataRepository.getAllMetadata(),
    ])

    const metadataMap = new Map(metadata.map((item) => [item.id, item]))

    return videos
      .map((video) => {
        const meta = metadataMap.get(video.id)
        return meta ? VideoAggregateMapper.fromEntities(video, meta) : undefined
      })
      .filter((aggregate): aggregate is VideoAggregate => Boolean(aggregate))
  }

  async postVideo(video: VideoEntity): Promise<VideoAggregate> {
    const metadata = await this.metadataRepository.upsertMetadata({
      id: video.id,
      votes: 0,
    })
    const videoEntity = await this.videoRepository.postVideo(video)

    return VideoAggregateMapper.fromEntities(videoEntity, metadata)
  }

  async updateVideo(
    aggregate: VideoAggregate,
  ): Promise<VideoAggregate | undefined> {
    const videoEntity = VideoAggregateMapper.toVideoEntity(aggregate)
    const metadataEntity = VideoAggregateMapper.toMetadataEntity(aggregate)

    const [video, metadata] = await Promise.all([
      this.videoRepository.postVideo(videoEntity),
      this.metadataRepository.upsertMetadata(metadataEntity),
    ])

    if (!video || !metadata) {
      return undefined
    }

    return VideoAggregateMapper.fromEntities(video, metadata)
  }

  async updateVotes(id: string, delta: number): Promise<MetadataEntity | null> {
    try {
      const metadata = await this.metadataRepository.getMetadata(id)

      if (!metadata) {
        return null
      }

      metadata.votes += delta

      return await this.metadataRepository.upsertMetadata(metadata)
    } catch (error) {
      this.logger.error('Failed to update votes', error)
      return null
    }
  }

  async wipeData(): Promise<void> {
    const [metadatas, videos] = await Promise.all([
      this.metadataRepository.getAllMetadata(),
      this.videoRepository.getAllVideos(),
    ])

    await Promise.all([
      ...metadatas.map((metadata) =>
        this.metadataRepository.deleteMetadata(metadata.id),
      ),
      ...videos.map((video) => this.videoRepository.deleteVideo(video.id)),
    ])
  }
}
