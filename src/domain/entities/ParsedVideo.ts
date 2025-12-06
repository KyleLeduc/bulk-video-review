import type { VideoAggregate } from './VideoAggregate'

export interface ParsedVideo extends VideoAggregate {
  url: string
  pinned: boolean
}
