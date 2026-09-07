import type { VideoPreviewDiagnostic } from './IVideoPreviewGenerator'

export type FileFinding = {
  severity: 'info' | 'warning' | 'error'
  code: string
  detail: string
}
export type FileInspection = {
  container: 'mp4-family' | 'matroska-webm' | 'avi' | 'ogg' | 'unknown'
  fragmented: boolean
  decodeChecked: false
  coverage: { readBytes: number; boxes: number; completeTopLevelScan: boolean }
  findings: FileFinding[]
}
export type FailedVideoSource = {
  videoId: string
  title: string
  storedDuration?: number
  failures: Record<string, string>
  diagnostics?: Record<string, VideoPreviewDiagnostic>
}
export interface IVideoFileInspector {
  inspect(file: File, options: { signal: AbortSignal }): Promise<FileInspection>
}
