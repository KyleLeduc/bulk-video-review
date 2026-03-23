import type {
  MetadataEntity,
  VideoAggregate,
  VideoEntity,
} from '@domain/entities'

export class VideoAggregateMapper {
  static fromEntities(
    video: VideoEntity,
    metadata: MetadataEntity,
  ): VideoAggregate {
    return {
      ...video,
      ...metadata,
    }
  }

  static toVideoEntity(aggregate: VideoAggregate): VideoEntity {
    return {
      id: aggregate.id,
      title: aggregate.title,
      thumb: aggregate.thumb,
      duration: aggregate.duration,
      thumbUrls: aggregate.thumbUrls,
      tags: aggregate.tags,
    }
  }

  static toMetadataEntity(aggregate: VideoAggregate): MetadataEntity {
    return {
      id: aggregate.id,
      votes: aggregate.votes,
    }
  }
}
