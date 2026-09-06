import type {
  IVideoPreviewGenerator,
  VideoPreviewOptions,
} from '@app/ports/IVideoPreviewGenerator'
import {
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  keyframeTargets,
  MOTION_FRAME_RATE,
  MOTION_SECONDS,
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  KEYFRAME_WIDTH,
} from '@domain/services/videoPreviewPolicy'
import { extractClipsWithWorker } from '../video/extraction/clipWorkerClient'
import { extractKeyframesWithWorker } from '../video/extraction/previewWorkerClient'
import { ExtractionError } from '../video/extraction/previewExtraction'

export class MediabunnyVideoPreviewGenerator implements IVideoPreviewGenerator {
  async generateMotionClips(
    file: File,
    { duration, signal }: VideoPreviewOptions,
  ) {
    const output = await extractClipsWithWorker(
      file,
      signal,
      MOTION_FRAME_RATE,
      MOTION_SECONDS,
      { kind: 'motion', duration },
    )
    const motionClips = output.clips.map((clip) => ({
      timestampSeconds: clip.start,
      durationSeconds: clip.duration,
      blob: clip.blob,
      width: output.width,
      height: output.height,
    }))
    if (
      !hasCompleteMotionClips({
        duration,
        motionClips,
        previewVersions: { motionClips: MOTION_PREVIEW_VERSION },
      })
    )
      throw new ExtractionError('output-invalid')
    return motionClips
  }

  async generateKeyframes(
    file: File,
    { duration, signal }: VideoPreviewOptions,
  ) {
    const output = await extractKeyframesWithWorker(
      file,
      duration,
      signal,
      KEYFRAME_WIDTH,
    )
    const targets = keyframeTargets(duration)
    const keyframes = output.frames.map((blob, i) => ({
      blob,
      timestampSeconds: targets[i],
      width: output.width,
      height: output.height,
    }))
    if (
      !hasCompleteKeyframes({
        duration,
        keyframes,
        previewVersions: { keyframes: KEYFRAME_PREVIEW_VERSION },
      })
    )
      throw new ExtractionError('output-invalid')
    return keyframes
  }
}
