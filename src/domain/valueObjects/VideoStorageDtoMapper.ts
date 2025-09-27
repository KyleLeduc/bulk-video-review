import type { VideoEntity, MetadataEntity } from '@domain/entities'

class VideoStorageDtoMapper {
  static toDto(
    video: VideoEntity,
    metadata: MetadataEntity,
  ): VideoEntity & MetadataEntity {
    return {
      ...video,
      ...metadata,
    }
  }
}

export { VideoStorageDtoMapper }
