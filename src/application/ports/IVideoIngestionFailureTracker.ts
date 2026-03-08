export interface IVideoIngestionFailureTracker {
  hasFailure(videoId: string): Promise<boolean>
  recordFailure(videoId: string): Promise<void>
  clearFailure(videoId: string): Promise<void>
}
