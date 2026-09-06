import type { ParsedVideo, VideoPreviewFrame } from '@domain/entities'

export const MOTION_PREVIEW_VERSION = 'motion-1.5s-20fps-320px-250k-v1'
export const KEYFRAME_PREVIEW_VERSION = 'keyframes-15s-100-160px-jpeg72-v1'
export const MOTION_SECONDS = 1.5
export const MOTION_FRAME_RATE = 20
export const KEYFRAME_WIDTH = 160
export const KEYFRAME_QUALITY = 0.72
const MAX_PRODUCT_BYTES = 16 * 1024 * 1024

export function keyframeTargets(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const count = Math.min(100, Math.ceil(duration / 15))
  const interval = Math.max(15, duration / 100)
  return Array.from({ length: count }, (_, i) => i * interval)
}

export function motionClipWindows(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return []
  // Preserve the tested overview density, independently of playback length.
  const count = Math.min(10, Math.max(1, Math.floor(duration / 3)))
  return Array.from({ length: count }, (_, i) => {
    const start = (duration / count) * i
    return { start, end: Math.min(duration, start + MOTION_SECONDS) }
  })
}

function validFrame(frame: VideoPreviewFrame, mimeTypes: string[]) {
  return (
    frame &&
    frame.blob instanceof Blob &&
    frame.blob.size > 0 &&
    mimeTypes.includes(frame.blob.type) &&
    [frame.width, frame.height].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 8192,
    ) &&
    frame.width * frame.height <= 33554432
  )
}

export function hasCompleteMotionClips(
  video: Pick<ParsedVideo, 'duration' | 'motionClips' | 'previewVersions'>,
): boolean {
  const windows = motionClipWindows(video.duration)
  const clips = video.motionClips
  return (
    video.previewVersions?.motionClips === MOTION_PREVIEW_VERSION &&
    windows.length > 0 &&
    Array.isArray(clips) &&
    clips.length === windows.length &&
    clips.every(
      (clip, i) =>
        validFrame(clip, ['video/mp4', 'video/webm']) &&
        clip.width <= 320 &&
        clip.height <= 320 &&
        clip.width % 2 === 0 &&
        clip.height % 2 === 0 &&
        clip.blob.size <= 2 * 1024 * 1024 &&
        Math.abs(clip.timestampSeconds - windows[i].start) < 1e-6 &&
        Math.abs(clip.durationSeconds - (windows[i].end - windows[i].start)) <
          1e-6,
    ) &&
    clips.reduce((sum, clip) => sum + clip.blob.size, 0) <= MAX_PRODUCT_BYTES
  )
}

export function hasCompleteKeyframes(
  video: Pick<ParsedVideo, 'duration' | 'keyframes' | 'previewVersions'>,
): boolean {
  const targets = keyframeTargets(video.duration)
  const frames = video.keyframes
  return (
    video.previewVersions?.keyframes === KEYFRAME_PREVIEW_VERSION &&
    targets.length > 0 &&
    Array.isArray(frames) &&
    frames.length === targets.length &&
    frames.every(
      (frame, i) =>
        validFrame(frame, ['image/jpeg']) &&
        frame.width <= KEYFRAME_WIDTH &&
        Math.abs(frame.timestampSeconds - targets[i]) < 1e-6,
    ) &&
    frames.reduce((sum, frame) => sum + frame.blob.size, 0) <= MAX_PRODUCT_BYTES
  )
}
