/** Encoded, muted browsing preview; source sampling may move at track boundaries. */
export interface VideoPreviewClip {
  /** Nominal overview slot on the original player's timeline, not an exact frame timestamp. */
  timestampSeconds: number
  /** Requested source trim length; can be shorter when usable video is shorter than the slot. */
  durationSeconds: number
  blob: Blob
  width: number
  height: number
}
