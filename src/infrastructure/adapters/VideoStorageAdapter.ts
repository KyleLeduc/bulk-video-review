import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { IVideoStorage } from '@app/ports'
import type { IVideoAggregateRepository } from '@domain/repositories'

export class VideoStorageAdapter implements IVideoStorage {
  constructor(private readonly repository: IVideoAggregateRepository) {}

  async getVideo(
    id: string,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    const result = await this.repository.getVideo(id)
    return result // Already the correct type from domain interface
  }

  async postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity> {
    return this.repository.postVideo(video)
  }

  async updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    return this.repository.updateVideo(video)
  }

  async updateVotes(id: string, delta: number): Promise<number | null> {
    const result = await this.repository.updateVotes(id, delta)
    return result ? result.votes : null
  }

  async wipeData(): Promise<void> {
    return this.repository.wipeData()
  }
}
