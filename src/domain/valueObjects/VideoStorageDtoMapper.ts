import type {
  VideoEntity,
  MetadataEntity,
  VideoStorageDto,
} from '@domain/entities'

class VideoStorageDtoMapper {
  static toDto(video: VideoEntity, metadata: MetadataEntity): VideoStorageDto {
    return {
      ...video,
      ...metadata,
    }
  }
}

export { VideoStorageDtoMapper }
