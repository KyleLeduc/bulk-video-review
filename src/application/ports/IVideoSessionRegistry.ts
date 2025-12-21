/**
 * Session-only registry for associating imported videos with their File objects and
 * providing short-lived object URLs on demand.
 *
 * This must never persist Files or blob URLs across sessions.
 */
export interface IVideoSessionRegistry {
  registerFile(videoId: string, file: File): void
  unregisterFile(videoId: string): void
  acquireObjectUrl(videoId: string): string | null
  releaseObjectUrl(videoId: string): void
}
