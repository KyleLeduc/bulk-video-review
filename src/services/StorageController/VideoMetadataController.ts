import type { VideoStorageDto, VideoEntity, VideoMetadataEntity } from '@/types'
import { handleMigrations } from './migrations/index'
import { MetadataRepository } from './infrastructure/repository/MetadataRepository'
import { VideoRepository } from './infrastructure/repository/VideoRepository'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataController {
  private static instance: VideoMetadataController

  private constructor(
    private metadataRepo: MetadataRepository,
    private videoRepo: VideoRepository,
  ) {}

  public static getInstance(): VideoMetadataController {
    if (!VideoMetadataController.instance) {
      const metadataRepo = new MetadataRepository()
      const videoRepo = new VideoRepository()

      VideoMetadataController.instance = new VideoMetadataController(
        metadataRepo,
        videoRepo,
      )
    }

    return VideoMetadataController.instance
  }

  init() {
    this.openDB()
  }

  private openDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('VideoMetaDataDB', 2)
      request.onupgradeneeded = async (event) => {
        console.log('Upgrading from version:', event.oldVersion)

        await handleMigrations(request, event.oldVersion)
      }

      request.onerror = () => reject(request.error!)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Gets the video w/ a matching id
   * @param id id of the video
   * @returns video or undefined
   */
  async getVideo(id: string): Promise<VideoStorageDto | undefined> {
    const videoData = await this.videoRepo.getVideo(id)
    const metadata = await this.metadataRepo.getMetadata(id)

    if (!videoData) return undefined
    return { ...videoData, ...metadata }
  }

  async postVideo(videoMetadata: VideoEntity): Promise<VideoStorageDto> {
    const { id } = videoMetadata
    const metadata = await this.metadataRepo.upsertMetadata({
      id,
      votes: 0,
    })

    const videoEntity = await this.videoRepo.postVideo(videoMetadata)

    return { ...videoEntity, ...metadata }
  }

  async updateVotes(
    id: string,
    delta: number,
  ): Promise<VideoMetadataEntity | null> {
    try {
      const metadata = await this.metadataRepo.getMetadata(id)

      if (metadata) {
        metadata.votes += delta

        return await this.metadataRepo.upsertMetadata(metadata)
      }

      return null
    } catch (e) {
      console.error(e)

      return null
    }
  }
}

export { VideoMetadataController }
