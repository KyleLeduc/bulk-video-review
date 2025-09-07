import type { VideoEntity, MetadataEntity } from '@domain/entities'

/**
 * Command operations for video data (write operations)
 */
export interface IVideoCommand {
  postVideo(video: VideoEntity): Promise<VideoEntity & MetadataEntity>
  updateVideo(
    video: VideoEntity & MetadataEntity,
  ): Promise<(VideoEntity & MetadataEntity) | undefined>
  updateVotes(id: string, delta: number): Promise<number | null>
  wipeData(): Promise<void>
}
