import type { VideoEntity, MetadataEntity } from '../entities'

export interface IVideoFacade {
  getVideo(id: string): Promise<(VideoEntity & MetadataEntity) | undefined>
  postVideo(videoMetadata: VideoEntity): Promise<VideoEntity & MetadataEntity>
  updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined>
  updateVotes(id: string, delta: number): Promise<MetadataEntity | null>
  wipeData(): Promise<void>
}
