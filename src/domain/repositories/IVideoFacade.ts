import type { VideoStorageDto, VideoEntity, MetadataEntity } from '../entities'

export interface IVideoFacade {
  getVideo(id: string): Promise<VideoStorageDto | undefined>
  postVideo(videoMetadata: VideoEntity): Promise<VideoStorageDto>
  updateVideo(video: VideoStorageDto): Promise<VideoStorageDto | undefined>
  updateVotes(id: string, delta: number): Promise<MetadataEntity | null>
  wipeData(): Promise<void>
}
