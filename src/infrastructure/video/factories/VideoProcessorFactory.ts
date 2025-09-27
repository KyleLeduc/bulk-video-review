import type {
  VideoProcessorInterface,
  VideoProcessorFactory as IVideoProcessorFactory,
} from '../interfaces/VideoProcessorInterface'
import { HTMLVideoProcessorAdapter } from '../processors/HTMLVideoProcessorAdapter'

export class DefaultVideoProcessorFactory implements IVideoProcessorFactory {
  create(source: File | string): VideoProcessorInterface {
    // For now, always return HTML processor
    // Later, we can add logic to choose FFmpeg WASM based on file size, browser support, etc.
    return new HTMLVideoProcessorAdapter()
  }
}

// Future factory that could switch between processors
export class SmartVideoProcessorFactory implements IVideoProcessorFactory {
  constructor(
    private useFFmpegWasm: boolean = false,
    private fileSizeThreshold: number = 50 * 1024 * 1024, // 50MB
  ) {}

  create(source: File | string): VideoProcessorInterface {
    // Logic to choose processor based on conditions
    if (
      this.useFFmpegWasm &&
      source instanceof File &&
      source.size > this.fileSizeThreshold
    ) {
      // TODO: Return FFmpegWasmProcessorAdapter when implemented
      console.log('Would use FFmpeg WASM for large file:', source.size)
    }

    return new HTMLVideoProcessorAdapter()
  }
}
