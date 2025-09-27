import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { IVideoStorage } from '@app/ports'
import type { IVideoFacade } from '@domain/repositories'

export class VideoStorageAdapter implements IVideoStorage {
  constructor(private readonly facade: IVideoFacade) {}

  async getVideo(
    id: string,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    const result = await this.facade.getVideo(id)
    return result // Already the correct type from domain interface
  }

  async postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity> {
    return this.facade.postVideo(video)
  }

  async updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    return this.facade.updateVideo(video)
  }

  async updateVotes(id: string, delta: number): Promise<number | null> {
    const result = await this.facade.updateVotes(id, delta)
    return result ? result.votes : null
  }

  async wipeData(): Promise<void> {
    return this.facade.wipeData()
  }
}
