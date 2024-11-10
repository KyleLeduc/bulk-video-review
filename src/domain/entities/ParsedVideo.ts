import type { VideoStorageDto } from './VideoStorageDto'

export interface ParsedVideo extends VideoStorageDto {
  url: string
  pinned: boolean
}
