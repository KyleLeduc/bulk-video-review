import type { VideoEntity, VideoMetadataEntity, VideoStorageDto } from '@/types'

class VideoStorageDtoMapper {
  static toDto(
    video: VideoEntity,
    metadata: VideoMetadataEntity,
  ): VideoStorageDto {
    return {
      ...video,
      ...metadata,
    }
  }
}

export { VideoStorageDtoMapper }
