import type { VideoEntity, MetadataEntity } from '@domain/entities'

export type VideoAggregate = VideoEntity & MetadataEntity

export interface IVideoAggregateRepository {
  getVideo(id: string): Promise<VideoAggregate | undefined>
  getAllVideos(): Promise<VideoAggregate[]>
  postVideo(video: VideoEntity): Promise<VideoAggregate>
  /** Updates video content only; votes are changed exclusively by updateVotes. */
  updateVideo(video: VideoAggregate): Promise<VideoAggregate | undefined>
  updateVotes(id: string, delta: number): Promise<MetadataEntity | null>
  wipeData(): Promise<void>
}
