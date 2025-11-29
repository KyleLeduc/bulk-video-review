import type { IVideoThumbnailGenerator } from '@app/ports'
import {
  generateThumbnails,
  loadVideoElement,
} from '@infra/video/services/videoDomUtils'

export class VideoThumbnailGeneratorAdapter
  implements IVideoThumbnailGenerator
{
  async generateThumbnails(url: string, count = 10): Promise<string[]> {
    const video = await loadVideoElement(url)
    return generateThumbnails(video, count)
  }
}
