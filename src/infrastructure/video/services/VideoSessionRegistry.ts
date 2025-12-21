import type { ILogger, IVideoSessionRegistry } from '@app/ports'

type UrlEntry = {
  url: string
  refCount: number
}

export class VideoSessionRegistry implements IVideoSessionRegistry {
  private readonly files = new Map<string, File>()
  private readonly urls = new Map<string, UrlEntry>()

  constructor(private readonly logger?: ILogger) {}

  registerFile(videoId: string, file: File): void {
    this.files.set(videoId, file)
  }

  unregisterFile(videoId: string): void {
    this.releaseAllUrls(videoId)
    this.files.delete(videoId)
  }

  acquireObjectUrl(videoId: string): string | null {
    const file = this.files.get(videoId)
    if (!file) {
      this.logger?.warn('No session file registered for video', { videoId })
      return null
    }

    const existing = this.urls.get(videoId)
    if (existing) {
      existing.refCount += 1
      return existing.url
    }

    const createObjectURL = (
      URL as unknown as {
        createObjectURL?: (file: File) => string
      }
    ).createObjectURL
    if (typeof createObjectURL !== 'function') {
      this.logger?.warn('URL.createObjectURL is unavailable', { videoId })
      return null
    }

    try {
      const url = createObjectURL(file)
      this.urls.set(videoId, { url, refCount: 1 })
      return url
    } catch (error) {
      this.logger?.error('Failed to create object URL', error)
      return null
    }
  }

  releaseObjectUrl(videoId: string): void {
    const entry = this.urls.get(videoId)
    if (!entry) {
      return
    }

    entry.refCount -= 1
    if (entry.refCount > 0) {
      return
    }

    this.urls.delete(videoId)

    const revokeObjectURL = (
      URL as unknown as {
        revokeObjectURL?: (url: string) => void
      }
    ).revokeObjectURL
    if (typeof revokeObjectURL !== 'function') {
      return
    }

    try {
      revokeObjectURL(entry.url)
    } catch (error) {
      this.logger?.error('Failed to revoke object URL', error)
    }
  }

  private releaseAllUrls(videoId: string) {
    const entry = this.urls.get(videoId)
    if (!entry) {
      return
    }

    entry.refCount = 1
    this.releaseObjectUrl(videoId)
  }
}
