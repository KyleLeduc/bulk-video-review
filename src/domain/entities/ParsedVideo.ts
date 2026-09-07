import type { VideoAggregate } from './VideoAggregate'
import type { VideoPreviewFrame } from './VideoPreviewFrame'
import type { VideoPreviewClip } from './VideoPreviewClip'

export interface ParsedVideo extends VideoAggregate {
  url: string
  pinned: boolean
  previewFrames: VideoPreviewFrame[]
  motionClips: VideoPreviewClip[]
  keyframes: VideoPreviewFrame[]
  previewVersions: { motionClips?: string; keyframes?: string }
  /** Complete, disposable still fallback; never a successful motion product. */
  motionFallback?: {
    version: string
    reason: string
    items: VideoPreviewFrame[]
  }
}
