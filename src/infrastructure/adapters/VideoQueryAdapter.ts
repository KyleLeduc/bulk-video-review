import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { IVideoQuery } from '@app/ports'
import type { IVideoAggregateRepository } from '@domain/repositories'

export class VideoQueryAdapter implements IVideoQuery {
  constructor(private readonly repository: IVideoAggregateRepository) {}

  async getVideo(
    id: string,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    const result = await this.repository.getVideo(id)
    return result // Already the correct type from domain interface
  }

  async getAllVideos(): Promise<(VideoEntity & MetadataEntity)[]> {
    return this.repository.getAllVideos()
  }
}
