import type { VideoEntity } from '../entities/VideoEntity'

export interface IVideoRepository {
  getVideo(id: string): Promise<VideoEntity>
  getAllVideos(): Promise<VideoEntity[]>
  postVideo(data: VideoEntity): Promise<VideoEntity>
  deleteVideo(id: string): Promise<void>
}
