import type { VideoEntity, MetadataEntity } from '@domain/entities'

export interface IVideoStorage {
  getVideo(id: string): Promise<(VideoEntity & MetadataEntity) | undefined>
  postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity>
  updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined>
  updateVotes(id: string, delta: number): Promise<number | null>
  wipeData(): Promise<void>
}
