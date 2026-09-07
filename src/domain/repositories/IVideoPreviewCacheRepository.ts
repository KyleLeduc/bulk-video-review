import type {
  ParsedVideo,
  VideoPreviewClip,
  VideoPreviewFrame,
} from '@domain/entities'

export type VideoPreviewProduct =
  | { kind: 'motionClips'; version: string; items: VideoPreviewClip[] }
  | { kind: 'keyframes'; version: string; items: VideoPreviewFrame[] }
  | ({ kind: 'motionFallback' } & NonNullable<ParsedVideo['motionFallback']>)
export type VideoPreviewProducts = Pick<
  ParsedVideo,
  'motionClips' | 'keyframes' | 'previewVersions' | 'motionFallback'
>
export type PreviewCacheWrite = { epoch: number; signal: AbortSignal }

/** Disposable derived data only. Epoch changes invalidate writes started before a wipe. */
export interface IVideoPreviewCacheRepository {
  readonly epoch: number
  getProducts(videoId: string, duration: number): Promise<VideoPreviewProducts>
  putProduct(
    videoId: string,
    duration: number,
    product: VideoPreviewProduct,
    ownership: PreviewCacheWrite,
  ): Promise<void>
  clear(): Promise<void>
}
