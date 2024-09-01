import type { VideoEntity } from '../entities/Video'

export interface IVideoRepository {
  getVideo(id: string): Promise<VideoEntity>
  postVideo(data: VideoEntity): Promise<VideoEntity>
}
