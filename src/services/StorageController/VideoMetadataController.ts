import type { VideoStorageDto, VideoEntity, VideoMetadataEntity } from '@/types'
import { storeNames } from './domain/constants'
import { handleMigrations } from './migrations/index'
import { MetadataRepository } from './infrastructure/repository/MetadataRepository'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataController {
  private static instance: VideoMetadataController
  private metadataRepo: MetadataRepository

  private constructor(metadataRepo: MetadataRepository) {
    this.metadataRepo = metadataRepo
  }

  public static getInstance(): VideoMetadataController {
    if (!VideoMetadataController.instance) {
      const metadataRepo = new MetadataRepository()

      VideoMetadataController.instance = new VideoMetadataController(
        metadataRepo,
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
    const videoData = await this.getVideoEntity(id)
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

    const videoEntity = await this.postVideoEntity(videoMetadata)

    return { ...videoEntity, ...metadata }
  }

  private async getVideoEntity(key: string): Promise<VideoStorageDto> {
    const db = await this.openDB()

    return new Promise<VideoStorageDto>((resolve, reject) => {
      const transaction = db.transaction(storeNames.video, 'readonly')
      const store = transaction.objectStore(storeNames.video)
      const request = store.get(key)

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () =>
        reject(new Error(request.error?.message ?? 'no error message found'))
    })
  }

  private async postVideoEntity(
    videoMetadata: VideoEntity,
  ): Promise<VideoEntity> {
    const db = await this.openDB()

    return new Promise<VideoEntity>((resolve, reject) => {
      const transaction = db.transaction(storeNames.video, 'readwrite')
      const store = transaction.objectStore(storeNames.video)
      const request = store.put(videoMetadata)

      request.onsuccess = () => resolve(videoMetadata)
      request.onerror = () => reject(request.error!)
    })
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
