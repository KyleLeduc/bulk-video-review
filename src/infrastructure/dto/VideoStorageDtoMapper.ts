import type { VideoEntity, MetadataEntity } from '@domain/entities'
import type { VideoStorageDto } from './VideoStorageDto'

export class VideoStorageDtoMapper {
  static toDto(video: VideoEntity, metadata: MetadataEntity): VideoStorageDto {
    return {
      ...video,
      ...metadata,
    }
  }

  static toVideoEntity(dto: VideoStorageDto): VideoEntity {
    const { votes, ...videoData } = dto
    return videoData
  }

  static toMetadataEntity(dto: VideoStorageDto): MetadataEntity {
    return {
      id: dto.id,
      votes: dto.votes,
    }
  }
}
