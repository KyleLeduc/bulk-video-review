import type { VideoStorageDto, VideoEntity, VideoMetadataEntity } from '@/types'
import {
  handleMigrations,
  MetadataRepository,
  VideoRepository,
} from '@/infrastructure'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataService {
  private static instance: VideoMetadataService

  private constructor(
    private metadataRepo: MetadataRepository,
    private videoRepo: VideoRepository,
  ) {}

  public static getInstance(): VideoMetadataService {
    if (!VideoMetadataService.instance) {
      const metadataRepo = new MetadataRepository()
      const videoRepo = new VideoRepository()

      VideoMetadataService.instance = new VideoMetadataService(
        metadataRepo,
        videoRepo,
      )
    }

    return VideoMetadataService.instance
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

export { VideoMetadataService }
