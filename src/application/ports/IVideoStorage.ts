import type { VideoEntity, VideoStorageDto } from '@domain/entities'

export interface IVideoStorage {
  getVideo(id: string): Promise<VideoStorageDto | undefined>
  postVideo(video: VideoEntity): Promise<VideoStorageDto>
  updateVideo(video: VideoStorageDto): Promise<VideoStorageDto | undefined>
  updateVotes(id: string, delta: number): Promise<number | null>
  wipeData(): Promise<void>
}
