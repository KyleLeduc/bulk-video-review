/** Encoded, muted preview. Timestamps use the original player's timeline. */
export interface VideoPreviewClip {
  timestampSeconds: number
  durationSeconds: number
  blob: Blob
  width: number
  height: number
}
