import type { IVideoThumbnailGenerator } from '@app/ports'
import { HTMLVideoProcessor } from '@infra/video'

export class VideoThumbnailGeneratorAdapter
  implements IVideoThumbnailGenerator
{
  async generateThumbnails(url: string, count = 10): Promise<string[]> {
    const processor = new HTMLVideoProcessor(url)
    await processor.isReady
    return processor.generateThumbnails(count)
  }
}
