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
    const { votes, ...video } = aggregate
    return video
  }

  static toMetadataEntity(aggregate: VideoAggregate): MetadataEntity {
    return {
      id: aggregate.id,
      votes: aggregate.votes,
    }
  }
}
