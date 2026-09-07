import type { VideoPreviewClip, VideoPreviewFrame } from '@domain/entities'

/** Allowlisted evidence only: never source paths or raw library error messages. */
export type VideoPreviewDiagnostic = {
  stage?: 'setup' | 'metadata' | 'timeline' | 'decode' | 'encode' | 'cleanup'
  errorName?: string
  cleanupFailed?: boolean
  codec?: string
  trackStart?: number
  trackEnd?: number
  storedDuration?: number
  readBytes?: number
  readCalls?: number
  elapsedMs?: number
  outputBytes?: number
}
export type VideoPreviewProgress = {
  completed: number
  total: number
  diagnostics: VideoPreviewDiagnostic
}
export type VideoPreviewOptions = {
  duration: number
  signal: AbortSignal
  onProgress?: (progress: VideoPreviewProgress) => void
}

/** Original files are session-owned inputs; generated products contain no source handles. */
export interface IVideoPreviewGenerator {
  generateMotionClips(
    file: File,
    options: VideoPreviewOptions,
  ): Promise<VideoPreviewClip[]>
  generateKeyframes(
    file: File,
    options: VideoPreviewOptions,
  ): Promise<VideoPreviewFrame[]>
}
