import type { VideoEntity, MetadataEntity } from '@domain/entities'

/**
 * Query operations for video data (read-only operations)
 */
export interface IVideoQuery {
  getVideo(id: string): Promise<(VideoEntity & MetadataEntity) | undefined>
  getAllVideos(): Promise<(VideoEntity & MetadataEntity)[]>
}
