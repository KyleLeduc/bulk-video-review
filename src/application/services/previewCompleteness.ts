import type { ParsedVideo } from '@domain/entities'
import {
  hasCompleteKeyframes,
  hasUsableMotionPreview,
} from '@domain/services/videoPreviewPolicy'

export function hasCompleteVideoPreviews(video: ParsedVideo): boolean {
  return hasUsableMotionPreview(video) && hasCompleteKeyframes(video)
}

// Legacy still benchmark policy: ten divisions, nine frames.
export const DEFAULT_PREVIEW_FRAME_COUNT = 9

export function previewFrameTarget(divisions = 10): number {
  return Math.max(0, Math.floor(divisions) - 1)
}

export function hasCompletePreviews(
  video: Pick<ParsedVideo, 'previewFrames' | 'thumbUrls'>,
  expected = DEFAULT_PREVIEW_FRAME_COUNT,
): boolean {
  // Match display precedence: any Blob set takes precedence over legacy URLs.
  const count =
    video.previewFrames.length > 0
      ? video.previewFrames.length
      : video.thumbUrls.length
  return expected > 0 && count >= expected
}
