import type { ParsedVideo } from '@domain/entities'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  IVideoPreviewCacheRepository,
  VideoPreviewProduct,
} from '@domain/repositories/IVideoPreviewCacheRepository'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import type { IVideoPreviewGenerator } from '@app/ports/IVideoPreviewGenerator'
import type { IVideoThumbnailGenerator } from '@app/ports/IVideoThumbnailGenerator'
import {
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  motionClipWindows,
  keyframeTargets,
  hasUsableMotionPreview,
  hasCompleteMotionFallback,
  MOTION_FALLBACK_VERSION,
  MOTION_FAILURE_REASONS,
} from '@domain/services/videoPreviewPolicy'

type ProductKind = 'motionClips' | 'keyframes'
export type PreviewEnrichmentOptions = {
  signal?: AbortSignal
  /** A scheduler may yield between complete products; omitted preserves batch callers. */
  product?: ProductKind
  /** Caller must also check its queue/controller ownership before merging this product. */
  onProduct?: (product: VideoPreviewProduct) => void
  onProgress?: (progress: {
    kind: ProductKind
    stage: 'generating' | 'persisting' | 'fallback' | 'saving-fallback'
    completed: number
    total: number
  }) => void
}
type ProductFailure = (typeof MOTION_FAILURE_REASONS)[number]
export type PreviewEnrichmentResult = {
  video: ParsedVideo
  failures: Partial<Record<VideoPreviewProduct['kind'], ProductFailure>>
  cacheFailures: VideoPreviewProduct['kind'][]
}
function failureReason(error: unknown): ProductFailure {
  const reason = (error as { reason?: string } | null)?.reason
  return MOTION_FAILURE_REASONS.includes(reason as ProductFailure)
    ? (reason as ProductFailure)
    : 'generation-failed'
}
const interrupted = () => new DOMException('Preview work retired', 'AbortError')

/** Independent complete products; no metadata writes and no second scheduler. */
export class UpdateVideoPreviewsUseCase {
  constructor(
    private readonly generator: IVideoPreviewGenerator,
    private readonly repository: Pick<IVideoAggregateRepository, 'getVideo'>,
    private readonly sessionRegistry: IVideoSessionRegistry,
    private readonly cache: IVideoPreviewCacheRepository,
    private readonly logger: ILogger,
    private readonly thumbnails: IVideoThumbnailGenerator,
  ) {}

  async execute(
    video: ParsedVideo,
    options: PreviewEnrichmentOptions = {},
  ): Promise<PreviewEnrichmentResult> {
    const signal = options.signal ?? new AbortController().signal
    signal.throwIfAborted()
    const result: PreviewEnrichmentResult = {
      video,
      failures:
        hasCompleteMotionFallback(video) && !hasCompleteMotionClips(video)
          ? { motionClips: video.motionFallback!.reason as ProductFailure }
          : {},
      cacheFailures: [],
    }
    const file = this.sessionRegistry.getFile(video.id)
    const epoch = this.cache.epoch
    const assertOwned = () => {
      signal.throwIfAborted()
      if (
        this.cache.epoch !== epoch ||
        this.sessionRegistry.getFile(video.id) !== file
      )
        throw interrupted()
    }
    const assertExists = async () => {
      assertOwned()
      const aggregate = await this.repository.getVideo(video.id)
      assertOwned()
      if (!aggregate) throw interrupted()
    }

    const products: ProductKind[] = options.product
      ? [options.product]
      : ['motionClips', 'keyframes']
    for (const kind of products) {
      assertOwned()
      const complete =
        kind === 'motionClips' ? hasCompleteMotionClips : hasCompleteKeyframes
      if (
        kind === 'motionClips'
          ? hasUsableMotionPreview(result.video)
          : complete(result.video)
      )
        continue
      if (!file) {
        result.failures[kind] = 'missing-source'
        continue
      }
      await assertExists()
      const total =
        kind === 'motionClips'
          ? motionClipWindows(video.duration).length
          : keyframeTargets(video.duration).length
      options.onProgress?.({ kind, stage: 'generating', completed: 0, total })
      let product: VideoPreviewProduct | undefined
      try {
        product =
          kind === 'motionClips'
            ? {
                kind,
                version: MOTION_PREVIEW_VERSION,
                items: await this.generator.generateMotionClips(file, {
                  duration: video.duration,
                  signal,
                }),
              }
            : {
                kind,
                version: KEYFRAME_PREVIEW_VERSION,
                items: await this.generator.generateKeyframes(file, {
                  duration: video.duration,
                  signal,
                }),
              }
        assertOwned()
        const candidate = {
          ...result.video,
          [kind]: product.items,
          previewVersions: {
            ...result.video.previewVersions,
            [kind]: product.version,
          },
        }
        if (!complete(candidate)) {
          result.failures[kind] = 'output-invalid'
          product = undefined
        }
      } catch (error) {
        assertOwned()
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error
        result.failures[kind] = failureReason(error)
      }
      if (!product && kind === 'motionClips') {
        await assertExists()
        const fallback: Extract<
          VideoPreviewProduct,
          { kind: 'motionFallback' }
        > = {
          kind: 'motionFallback',
          version: MOTION_FALLBACK_VERSION,
          reason: result.failures.motionClips!,
          items: video.previewFrames,
        }
        try {
          if (
            !hasCompleteMotionFallback({ ...video, motionFallback: fallback })
          ) {
            options.onProgress?.({
              kind,
              stage: 'fallback',
              completed: 0,
              total: 9,
            })
            assertOwned()
            const url = this.sessionRegistry.acquireObjectUrl(video.id)
            if (!url) throw new Error('Original source unavailable')
            try {
              fallback.items = await this.thumbnails.generateThumbnails(url, {
                count: 10,
                maxWidth: 320,
                signal,
                onProgress: (progress) => {
                  assertOwned()
                  options.onProgress?.({
                    kind,
                    stage: 'fallback',
                    completed: progress.completedFrames,
                    total: 9,
                  })
                },
              })
            } finally {
              this.sessionRegistry.releaseObjectUrl(video.id, url)
            }
          }
          assertOwned()
          if (hasCompleteMotionFallback({ ...video, motionFallback: fallback }))
            product = fallback
          else result.failures.motionFallback = 'output-invalid'
        } catch (error) {
          assertOwned()
          if (error instanceof DOMException && error.name === 'AbortError')
            throw error
          result.failures.motionFallback = failureReason(error)
        }
      }
      if (!product) continue
      await assertExists()
      result.video =
        product.kind === 'motionFallback'
          ? {
              ...result.video,
              motionFallback: {
                version: product.version,
                reason: product.reason,
                items: product.items,
              },
            }
          : {
              ...result.video,
              [kind]: product.items,
              previewVersions: {
                ...result.video.previewVersions,
                [kind]: product.version,
              },
            }
      // Retain in-session success BEFORE optional persistence or the next cancellable product.
      options.onProduct?.(product)
      assertOwned()
      options.onProgress?.({
        kind,
        stage:
          product.kind === 'motionFallback' ? 'saving-fallback' : 'persisting',
        completed: product.items.length,
        total: product.items.length,
      })
      try {
        await this.cache.putProduct(video.id, video.duration, product, {
          epoch,
          signal,
        })
      } catch {
        assertOwned()
        result.cacheFailures.push(product.kind)
        this.logger.warn('[video-previews] cache-write:failed', {
          videoId: video.id,
          kind: product.kind,
        })
      }
    }
    assertOwned()
    return result
  }
}
