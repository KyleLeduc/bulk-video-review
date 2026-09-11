import { describe, expect, it } from 'vitest'
import { buildParsedVideo } from '@test-utils/index'
import {
  keyframeTargets,
  motionClipWindows,
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  MOTION_FALLBACK_VERSION,
  hasCompleteMotionFallback,
  hasUsableMotionPreview,
} from './videoPreviewPolicy'

describe('video preview product policy', () => {
  it.each([0.76, 1, 0, -1, NaN, Infinity, 1.1])(
    'validates a short source clip duration %s against its nominal slot',
    (durationSeconds) => {
      const video = buildParsedVideo({
        duration: 1,
        previewVersions: { motionClips: MOTION_PREVIEW_VERSION },
        motionClips: [
          {
            timestampSeconds: 0,
            durationSeconds,
            width: 160,
            height: 90,
            blob: new Blob(['mp4'], { type: 'video/mp4' }),
          },
        ],
      })
      expect(hasCompleteMotionClips(video)).toBe(
        durationSeconds > 0 && durationSeconds <= 1,
      )
    },
  )
  it('accepts only complete bounded still fallback with a sanitized original failure', () => {
    const video = buildParsedVideo({ duration: 60 })
    video.motionFallback = {
      version: MOTION_FALLBACK_VERSION,
      reason: 'unsupported',
      items: Array.from({ length: 9 }, (_, i) => ({
        timestampSeconds: (i + 1) * 6,
        width: 320,
        height: 180,
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })),
    }
    expect(hasCompleteMotionFallback(video)).toBe(true)
    expect(hasUsableMotionPreview(video)).toBe(true)
    expect(hasCompleteMotionClips(video)).toBe(false)
    const good = video.motionFallback
    for (const patch of [
      { version: 'old' },
      { reason: 'private filename or arbitrary error' },
      { items: good.items.slice(1) },
      { items: good.items.map((f) => ({ ...f, width: 321 })) },
      { items: good.items.map((f) => ({ ...f, timestampSeconds: NaN })) },
      { items: good.items.map((f) => ({ ...f, blob: new Blob([]) })) },
    ]) {
      video.motionFallback = { ...good, ...patch }
      expect(hasCompleteMotionFallback(video)).toBe(false)
    }
  })
  it('samples every 15 seconds, capped at 100 across the entire video', () => {
    expect(keyframeTargets(10)).toEqual([0])
    expect(keyframeTargets(60)).toEqual([0, 15, 30, 45])
    expect(keyframeTargets(1500)).toHaveLength(100)
    expect(keyframeTargets(3000)).toEqual(
      Array.from({ length: 100 }, (_, i) => i * 30),
    )
    expect(keyframeTargets(15.1)).toEqual([0, 15])
    for (const duration of [0, -1, NaN, Infinity]) {
      expect(keyframeTargets(duration)).toEqual([])
      expect(motionClipWindows(duration)).toEqual([])
    }
  })

  it('keeps up to ten duration-appropriate 1.5-second windows', () => {
    expect(motionClipWindows(1)).toEqual([{ start: 0, end: 1 }])
    expect(motionClipWindows(6)).toEqual([
      { start: 0, end: 1.5 },
      { start: 3, end: 4.5 },
    ])
    expect(motionClipWindows(60)).toHaveLength(10)
  })

  it('requires each complete, versioned product independently', () => {
    const video = buildParsedVideo({ duration: 60 })
    video.motionClips = motionClipWindows(60).map(({ start, end }) => ({
      timestampSeconds: start,
      durationSeconds: end - start,
      blob: new Blob(['clip'], { type: 'video/mp4' }),
      width: 320,
      height: 180,
    }))
    video.keyframes = keyframeTargets(60).map((timestampSeconds) => ({
      timestampSeconds,
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      width: 160,
      height: 90,
    }))
    expect(hasCompleteMotionClips(video)).toBe(false)
    video.previewVersions = {
      motionClips: MOTION_PREVIEW_VERSION,
      keyframes: KEYFRAME_PREVIEW_VERSION,
    }
    expect(hasCompleteMotionClips(video)).toBe(true)
    expect(hasCompleteKeyframes(video)).toBe(true)
    video.motionClips.pop()
    expect(hasCompleteMotionClips(video)).toBe(false)
    expect(hasCompleteKeyframes(video)).toBe(true)
    video.keyframes[0].timestampSeconds = 1
    expect(hasCompleteKeyframes(video)).toBe(false)
    video.keyframes[0].timestampSeconds = 0
    video.previewVersions.keyframes = 'old-recipe'
    expect(hasCompleteKeyframes(video)).toBe(false)
  })

  it('rejects empty blobs, oversized dimensions and legacy still-only records', () => {
    const video = buildParsedVideo({
      duration: 1,
      thumbUrls: Array(9).fill('legacy'),
    })
    expect(hasCompleteMotionClips(video)).toBe(false)
    video.previewVersions = { keyframes: KEYFRAME_PREVIEW_VERSION }
    video.keyframes = [
      {
        timestampSeconds: 0,
        width: 160,
        height: 90,
        blob: new Blob([], { type: 'image/jpeg' }),
      },
    ]
    expect(hasCompleteKeyframes(video)).toBe(false)
    video.keyframes[0].blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    video.keyframes[0].width = 480
    expect(hasCompleteKeyframes(video)).toBe(false)
  })
})
