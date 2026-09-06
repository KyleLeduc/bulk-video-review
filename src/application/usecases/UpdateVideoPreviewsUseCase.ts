import type { ParsedVideo } from '@domain/entities'
import type { IVideoAggregateRepository } from '@domain/repositories'
import type {
  IVideoPreviewCacheRepository,
  VideoPreviewProduct,
} from '@domain/repositories/IVideoPreviewCacheRepository'
import type { ILogger, IVideoSessionRegistry } from '@app/ports'
import type { IVideoPreviewGenerator } from '@app/ports/IVideoPreviewGenerator'
import {
  hasCompleteMotionClips,
  hasCompleteKeyframes,
  MOTION_PREVIEW_VERSION,
  KEYFRAME_PREVIEW_VERSION,
  motionClipWindows,
  keyframeTargets,
} from '@domain/services/videoPreviewPolicy'

type ProductKind = VideoPreviewProduct['kind']
export type PreviewEnrichmentOptions = {
  signal?: AbortSignal
  /** Caller must also check its queue/controller ownership before merging this product. */
  onProduct?: (product: VideoPreviewProduct) => void
  onProgress?: (progress: {
    kind: ProductKind
    stage: 'generating' | 'persisting'
    completed: number
    total: number
  }) => void
}
const reasons = [
  'unsupported',
  'unsupported-timeline',
  'invalid-metadata',
  'read-limit',
  'output-invalid',
  'deadline',
] as const
type ProductFailure =
  | (typeof reasons)[number]
  | 'generation-failed'
  | 'missing-source'
export type PreviewEnrichmentResult = {
  video: ParsedVideo
  failures: Partial<Record<ProductKind, ProductFailure>>
  cacheFailures: ProductKind[]
}
function failureReason(error: unknown): ProductFailure {
  const reason = (error as { reason?: string } | null)?.reason
  return reasons.includes(reason as (typeof reasons)[number])
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
  ) {}

  async execute(
    video: ParsedVideo,
    options: PreviewEnrichmentOptions = {},
  ): Promise<PreviewEnrichmentResult> {
    const signal = options.signal ?? new AbortController().signal
    signal.throwIfAborted()
    const result: PreviewEnrichmentResult = {
      video,
      failures: {},
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

    for (const kind of ['motionClips', 'keyframes'] as const) {
      assertOwned()
      const complete =
        kind === 'motionClips' ? hasCompleteMotionClips : hasCompleteKeyframes
      if (complete(result.video)) continue
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
      let product: VideoPreviewProduct
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
          continue
        }
      } catch (error) {
        assertOwned()
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error
        result.failures[kind] = failureReason(error)
        continue
      }
      await assertExists()
      result.video = {
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
        stage: 'persisting',
        completed: product.items.length,
        total,
      })
      try {
        await this.cache.putProduct(video.id, video.duration, product, {
          epoch,
          signal,
        })
      } catch {
        assertOwned()
        result.cacheFailures.push(kind)
        this.logger.warn('[video-previews] cache-write:failed', {
          videoId: video.id,
          kind,
        })
      }
    }
    assertOwned()
    return result
  }
}
