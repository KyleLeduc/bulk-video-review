export interface VideoPreviewFrame {
  /** Nominal player-time browsing slot; the decoded frame may be nearby. */
  timestampSeconds: number
  blob: Blob
  width: number
  height: number
}
