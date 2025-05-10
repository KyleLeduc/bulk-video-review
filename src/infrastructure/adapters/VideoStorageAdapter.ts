import type { VideoEntity, VideoStorageDto } from '@domain/entities'
import type { IVideoStorage } from '@app/ports/IVideoStorage'
import { VideoMetadataFacade } from '@infra/services'

export class VideoStorageAdapter implements IVideoStorage {
  private readonly facade = VideoMetadataFacade.getInstance()

  async getVideo(id: string): Promise<VideoStorageDto | undefined> {
    return this.facade.getVideo(id)
  }

  async postVideo(video: VideoEntity): Promise<VideoStorageDto> {
    return this.facade.postVideo(video)
  }

  async updateVideo(
    video: VideoStorageDto,
  ): Promise<VideoStorageDto | undefined> {
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
