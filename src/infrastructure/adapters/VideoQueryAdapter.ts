import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { IVideoQuery } from '@app/ports'
import type { IVideoFacade } from '@domain/repositories'

export class VideoQueryAdapter implements IVideoQuery {
  constructor(private readonly facade: IVideoFacade) {}

  async getVideo(
    id: string,
  ): Promise<(VideoEntity & MetadataEntity) | undefined> {
    const result = await this.facade.getVideo(id)
    return result // Already the correct type from domain interface
  }

  async getAllVideos(): Promise<(VideoEntity & MetadataEntity)[]> {
    // This would need to be implemented in the facade
    // For now, return empty array as placeholder
    return []
  }
}
