import type {
  IVideoThumbnailGenerator,
  VideoPreviewGenerationOptions,
} from '@app/ports'
import {
  disposeVideoElement,
  generateThumbnails,
  loadVideoElement,
} from '@infra/video/services/videoDomUtils'

export class VideoThumbnailGeneratorAdapter
  implements IVideoThumbnailGenerator
{
  async generateThumbnails(
    url: string,
    options: VideoPreviewGenerationOptions = {},
  ) {
    let video: HTMLVideoElement | null = null

    try {
      options.onProgress?.({
        stage: 'loading',
        completedFrames: 0,
        totalFrames: Math.max(0, (options.count ?? 10) - 1),
      })
      video = await loadVideoElement(url, { signal: options.signal })
      return await generateThumbnails(video, options)
    } finally {
      disposeVideoElement(video)
    }
  }
}
