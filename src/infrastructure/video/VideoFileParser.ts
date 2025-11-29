import type { VideoEntity } from '@domain/entities'
import type { VideoProcessorFactory } from './interfaces/VideoProcessorInterface'
import { DefaultVideoProcessorFactory } from './factories/VideoProcessorFactory'
import { VideoProcessingPipeline } from './services/VideoProcessingPipeline'
import { FileHashGenerator } from './services/FileHashGenerator'

export class VideoFileParser {
  private readonly processingPipeline: VideoProcessingPipeline

  // ProcessingPipeline keeps ingestion pluggable (HTML video vs. ffmpeg-wasm later)
  constructor(
    private readonly processorFactory: VideoProcessorFactory = new DefaultVideoProcessorFactory(),
    private readonly hashGenerator: FileHashGenerator = new FileHashGenerator(),
    processingPipeline?: VideoProcessingPipeline,
  ) {
    this.processingPipeline =
      processingPipeline ??
      new VideoProcessingPipeline(this.processorFactory, this.hashGenerator)
  }

  readonly #generateMetadata = async (video: File) => {
    const taskId = await this.processingPipeline.queueVideoProcessing(video)
    return this.processingPipeline.waitForCompletion(taskId)
  }

  generateHash = async (video: File) => this.hashGenerator.generate(video)

  readonly #isValidVideoType = (video: File) => {
    const validVideoMimeTypes = [
      'video/mp4', // MP4 (H.264/AAC)
      'video/webm', // WebM (VP8/VP9)
      'video/ogg', // Ogg (Theora/Vorbis)
      'video/quicktime', // QuickTime
      'video/x-matroska', // Matroska (WebM compatible codecs)
    ]

    return video.type ? validVideoMimeTypes.includes(video.type) : false
  }

  transformVideoData = async (video: File) => {
    if (!this.#isValidVideoType(video)) {
      console.log('invalid video type', video)
      return
    }

    try {
      const { thumbUrl, duration, id, url, thumbUrls } =
        await this.#generateMetadata(video)

      const videoEntity: VideoEntity = {
        id,
        title: video.name,
        thumb: thumbUrl,
        duration,
        thumbUrls,
        tags: [],
      }

      return { videoEntity, url }
    } catch (e) {
      console.error(e, video)
    }
  }
}
