import type { VideoStorageDto } from './Entities'

export type {
  VideoEntity,
  VideoMetadataEntity,
  VideoStorageDto,
} from './Entities'

export interface Thumbs {
  size: string
  width: number
  height: number
  src: string
}

export interface VideoMetadata {
  thumbUrl: string
  id: string
  duration: number
}

export interface ParsedVideo extends VideoStorageDto {
  url: string
  pinned: boolean
}
