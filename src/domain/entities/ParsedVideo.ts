import type { VideoAggregate } from './VideoAggregate'
import type { VideoPreviewFrame } from './VideoPreviewFrame'

export interface ParsedVideo extends VideoAggregate {
  url: string
  pinned: boolean
  previewFrames: VideoPreviewFrame[]
}
