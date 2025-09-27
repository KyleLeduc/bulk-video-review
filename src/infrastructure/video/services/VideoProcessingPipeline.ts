import type {
  VideoProcessorInterface,
  VideoProcessorFactory,
} from '../interfaces/VideoProcessorInterface'
import { ParsedVideoData } from '@domain/valueObjects'

export interface ProcessingTask {
  id: string
  file: File
  processor: VideoProcessorInterface
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: ParsedVideoData
  error?: Error
}

export class VideoProcessingPipeline {
  private tasks = new Map<string, ProcessingTask>()
  private processingQueue: ProcessingTask[] = []
  private activeProcessing = 0
  private maxConcurrent = 2 // Can be configured

  constructor(private processorFactory: VideoProcessorFactory) {}

  async queueVideoProcessing(file: File): Promise<string> {
    const taskId = await this.generateFileHash(file)

    // Check if already processing/completed
    if (this.tasks.has(taskId)) {
      return taskId
    }

    const processor = this.processorFactory.create(file)
    const task: ProcessingTask = {
      id: taskId,
      file,
      processor,
      status: 'pending',
    }

    this.tasks.set(taskId, task)
    this.processingQueue.push(task)

    // Start processing if slot available
    this.processNext()

    return taskId
  }

  getTaskStatus(taskId: string): ProcessingTask | undefined {
    return this.tasks.get(taskId)
  }

  async waitForCompletion(taskId: string): Promise<ParsedVideoData> {
    return new Promise((resolve, reject) => {
      const checkTask = () => {
        const task = this.tasks.get(taskId)
        if (!task) {
          reject(new Error('Task not found'))
          return
        }

        if (task.status === 'completed' && task.result) {
          resolve(task.result)
        } else if (task.status === 'failed') {
          reject(task.error || new Error('Processing failed'))
        } else {
          // Check again in 100ms
          setTimeout(checkTask, 100)
        }
      }
      checkTask()
    })
  }

  private async processNext(): Promise<void> {
    if (
      this.activeProcessing >= this.maxConcurrent ||
      this.processingQueue.length === 0
    ) {
      return
    }

    const task = this.processingQueue.shift()
    if (!task) return

    this.activeProcessing++
    task.status = 'processing'

    try {
      const result = await this.processVideo(task)
      task.result = result
      task.status = 'completed'
    } catch (error) {
      task.error = error as Error
      task.status = 'failed'
      console.error('Video processing failed:', error)
    } finally {
      this.activeProcessing--
      task.processor.dispose()

      // Process next in queue
      this.processNext()
    }
  }

  private async processVideo(task: ProcessingTask): Promise<ParsedVideoData> {
    await task.processor.loadVideo(task.file)

    const metadata = await task.processor.getMetadata()
    const videoData = new ParsedVideoData(task.id)

    videoData.duration = metadata.duration
    videoData.url = URL.createObjectURL(task.file)

    // Generate primary thumbnail at 10% or 45s, whichever is smaller
    const thumbnailTime = Math.min(45, metadata.duration * 0.1)
    const thumbnail = await task.processor.generateThumbnail({
      timestamp: thumbnailTime,
    })
    videoData.thumbUrl = thumbnail

    // Generate additional thumbnails for timeline scrubbing
    const additionalThumbnails = await task.processor.generateThumbnails({
      count: 10,
      quality: 0.3,
    })
    videoData.thumbUrls.push(...additionalThumbnails)

    return videoData
  }

  private async generateFileHash(file: File): Promise<string> {
    // More robust hashing using actual file content sample
    const chunk = file.slice(0, 8192) // First 8KB
    const buffer = await chunk.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
}
