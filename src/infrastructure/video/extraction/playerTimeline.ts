import { Logging } from 'mediabunny'
import { ExtractionError } from './previewExtraction'
import type { VideoPreviewDiagnostic } from '@app/ports/IVideoPreviewGenerator'
import type { ClipWindow } from './clipExtraction'

type TimelineTrack = {
  getFirstTimestamp(): Promise<number>
  computeDuration(): Promise<number>
  getTimeResolution(): Promise<number>
}

/** Pinned Mediabunny 1.55.7 gate. Its public timestamps already include supported MP4 edits. */
export function createPlayerTimelineGuard() {
  let unsupportedEdit = false
  let evidence: VideoPreviewDiagnostic = {}
  const dispose = Logging.on('warn', (args) => {
    if (
      args.some(
        (arg) =>
          typeof arg === 'string' && arg.startsWith('Unsupported edit list'),
      )
    )
      unsupportedEdit = true
  })
  const reject = (
    reason: NonNullable<VideoPreviewDiagnostic['timelineReason']>,
  ): never => {
    evidence.timelineReason = reason
    throw new ExtractionError('unsupported-timeline')
  }
  const assertSupported = () => {
    if (unsupportedEdit) reject('unsupported-edit-list')
  }
  return {
    diagnostics: () => ({ ...evidence }),
    dispose,
    assertSupported,
    async check(track: TimelineTrack, duration: number) {
      const first = await track.getFirstTimestamp()
      const end = await track.computeDuration()
      const resolution = await track.getTimeResolution()
      evidence = {
        trackStart: first,
        trackEnd: end,
        storedDuration: duration,
        timeResolution: resolution,
      }
      assertSupported()
      if (
        ![first, end, resolution, duration].every(Number.isFinite) ||
        resolution <= 0 ||
        duration <= 0
      )
        reject('invalid-timing')
      const tolerance = 1 / resolution
      const start = Math.max(0, first)
      const usableEnd = Math.min(end, duration)
      if (!Number.isFinite(tolerance) || usableEnd <= start)
        reject('invalid-timing')
      // Browsing slots are approximate. A tick is timestamp precision, not an
      // allowed player/track duration mismatch. Never sample the exclusive end.
      const lastTarget = Math.max(start, usableEnd - tolerance)
      return {
        tolerance,
        clampTimestamp: (target: number) =>
          Math.max(start, Math.min(target, lastTarget)),
        clampWindow: (window: ClipWindow): ClipWindow => {
          const length = Math.min(window.end - window.start, usableEnd - start)
          const clipStart = Math.max(
            start,
            Math.min(window.start, usableEnd - length),
          )
          return {
            start: clipStart,
            end: Math.min(usableEnd, clipStart + length),
          }
        },
      }
    },
  }
}
