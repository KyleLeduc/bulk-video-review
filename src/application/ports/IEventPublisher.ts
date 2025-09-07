/**
 * Domain events that can be published
 */
export interface DomainEvent {
  eventType: string
  aggregateId: string
  timestamp: Date
  data: unknown
}

export interface VideoAddedEvent extends DomainEvent {
  eventType: 'VideoAdded'
  data: {
    videoId: string
    title: string
    duration: number
  }
}

export interface VideoVotesUpdatedEvent extends DomainEvent {
  eventType: 'VideoVotesUpdated'
  data: {
    videoId: string
    oldVotes: number
    newVotes: number
    delta: number
  }
}

export interface VideoThumbnailUpdatedEvent extends DomainEvent {
  eventType: 'VideoThumbnailUpdated'
  data: {
    videoId: string
    thumbnailCount: number
  }
}

/**
 * Event publishing operations for domain events
 */
export interface IEventPublisher {
  publish(event: DomainEvent): Promise<void>
  publishBatch(events: DomainEvent[]): Promise<void>
}
