import { Logging } from 'mediabunny'
import { ExtractionError } from './previewExtraction'

type TimelineTrack = {
  getFirstTimestamp(): Promise<number>
  computeDuration(): Promise<number>
  getTimeResolution(): Promise<number>
}

/** Pinned Mediabunny 1.55.7 gate. Its public timestamps already include supported MP4 edits. */
export function createPlayerTimelineGuard() {
  let unsupportedEdit = false
  const dispose = Logging.on('warn', (args) => {
    if (
      args.some(
        (arg) =>
          typeof arg === 'string' && arg.startsWith('Unsupported edit list'),
      )
    )
      unsupportedEdit = true
  })
  const assertSupported = () => {
    if (unsupportedEdit) throw new ExtractionError('unsupported-timeline')
  }
  return {
    dispose,
    assertSupported,
    async check(track: TimelineTrack, duration: number) {
      const first = await track.getFirstTimestamp()
      const end = await track.computeDuration()
      const resolution = await track.getTimeResolution()
      assertSupported()
      if (
        ![first, end, resolution, duration].every(Number.isFinite) ||
        resolution <= 0 ||
        duration <= 0
      )
        throw new ExtractionError('unsupported-timeline')
      const tolerance = 1 / resolution
      // Blank leading edits and a video track shorter than the player are not yet qualified.
      if (first > tolerance || end + tolerance < duration)
        throw new ExtractionError('unsupported-timeline')
      return tolerance
    },
  }
}
