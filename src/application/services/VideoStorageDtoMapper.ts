import type { VideoEntity, MetadataEntity, VideoStorageDto } from '@/domain'

class VideoStorageDtoMapper {
  static toDto(video: VideoEntity, metadata: MetadataEntity): VideoStorageDto {
    return {
      ...video,
      ...metadata,
    }
  }
}

export { VideoStorageDtoMapper }
