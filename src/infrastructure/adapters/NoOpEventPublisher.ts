import type { DomainEvent, IEventPublisher } from '@app/ports'

/**
 * No-operation event publisher that silently discards events
 * Can be replaced with actual event bus implementation later
 */
export class NoOpEventPublisher implements IEventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    // In a real implementation, this would publish to an event bus
    // For now, we just silently discard the event
    void event
  }

  async publishBatch(events: DomainEvent[]): Promise<void> {
    // In a real implementation, this would batch publish to an event bus
    // For now, we just silently discard the events
    void events
  }
}
