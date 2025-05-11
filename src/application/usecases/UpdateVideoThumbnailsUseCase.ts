import type { ParsedVideo } from '@domain/entities'
import type { IVideoThumbnailGenerator, IVideoStorage } from '@app/ports'

export class UpdateVideoThumbnailsUseCase {
  constructor(
    private readonly thumbnailGenerator: IVideoThumbnailGenerator,
    private readonly videoStorage: IVideoStorage,
  ) {}

  async execute(video: ParsedVideo): Promise<ParsedVideo> {
    if (video.thumbUrls.length > 1) {
      return video
    }

    const thumbs = await this.thumbnailGenerator.generateThumbnails(video.url)

    const dto = await this.videoStorage.updateVideo({
      ...video,
      thumbUrls: thumbs,
    })

    if (!dto) {
      return video
    }

    return {
      ...dto,
      url: video.url,
      pinned: video.pinned,
    }
  }
}
