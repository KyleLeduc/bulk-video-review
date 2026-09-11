import { Logging } from 'mediabunny'
import { ExtractionError } from './previewExtraction'
import type { VideoPreviewDiagnostic } from '@app/ports/IVideoPreviewGenerator'

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
      // Blank leading edits and a video track shorter than the player are not yet qualified.
      if (first > tolerance) reject('leading-gap')
      if (end + tolerance < duration) reject('track-ends-before-player')
      return tolerance
    },
  }
}
