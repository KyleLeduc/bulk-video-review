export interface VideoEntity {
  id: string
  title: string
  thumb: string
  duration: number
  thumbUrls: string[]
  tags: string[]
}

export interface VideoMetadataEntity {
  id: string
  votes: number
}

export type VideoStorageDto = VideoEntity & VideoMetadataEntity
