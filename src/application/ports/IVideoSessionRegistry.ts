/**
 * Session-only registry for associating imported videos with their File objects and
 * providing short-lived object URLs on demand.
 *
 * This must never persist Files or blob URLs across sessions.
 */
export interface IVideoSessionRegistry {
  registerFile(videoId: string, file: File): void
  getFile(videoId: string): File | null
  unregisterFile(videoId: string): void
  acquireObjectUrl(videoId: string): string | null
  /** Async owners pass their acquired URL so stale cleanup cannot release a replacement. */
  releaseObjectUrl(videoId: string, expectedUrl?: string): void
}
