import type { VideoStorageDto, VideoEntity, VideoMetadataEntity } from '@/types'
import { handleMigrations } from './migrations/index'

const videoStoreName = 'videoCacheDto'
const videoMetadataStoreName = 'VideoMetadata'

/**
 * IndexedDb bridge to handle storing video metadata
 */
class VideoMetadataController {
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

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Gets the video w/ a matching id
   * @param key id of the video
   * @returns video or undefined
   */
  async get(key: string): Promise<VideoStorageDto | undefined> {
    const videoData = await this.getVideoEntity(key)
    const metadata = await this.getMetadata(key)

    if (!videoData) return undefined
    return { ...videoData, ...metadata }
  }

  async post(videoMetadata: VideoEntity): Promise<VideoStorageDto> {
    const { id } = videoMetadata

    const voteEntity = await this.postVoteEntity({ id, votes: 0 })
    const videoEntity = await this.postVideoEntity(videoMetadata)

    return { ...videoEntity, ...voteEntity }
  }

  private async getVideoEntity(
    key: string,
  ): Promise<VideoStorageDto | undefined> {
    const db = await this.openDB()

    return new Promise<VideoStorageDto>((resolve, reject) => {
      const transaction = db.transaction(videoStoreName, 'readonly')
      const store = transaction.objectStore(videoStoreName)
      const request = store.get(key)

      request.onsuccess = () => {
        resolve(request.result ?? undefined)
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
      const transaction = db.transaction(videoStoreName, 'readwrite')
      const store = transaction.objectStore(videoStoreName)
      const request = store.put(videoMetadata)

      request.onsuccess = () => resolve(videoMetadata)
      request.onerror = () => reject(request.error)
    })
  }

  async updateVotes(id: string, vote: number) {
    try {
      const metadata = await this.getMetadata(id)
      if (!metadata) {
        throw new Error('video not found')
      }

      const videoVoteEntity: VideoMetadataEntity = {
        ...metadata,
        votes: metadata.votes + vote,
      }

      await this.postVoteEntity(videoVoteEntity)
    } catch (e) {
      console.error(e)
    }
  }

  private async getMetadata(
    id: string,
  ): Promise<VideoMetadataEntity | undefined> {
    const db = await this.openDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(videoMetadataStoreName)
      const store = transaction.objectStore(videoMetadataStoreName)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private async postVoteEntity(metadata: VideoMetadataEntity) {
    const db = await this.openDB()

    return new Promise<VideoMetadataEntity>((resolve, reject) => {
      const transaction = db.transaction(videoMetadataStoreName, 'readwrite')
      const store = transaction.objectStore(videoMetadataStoreName)
      const request = store.put(metadata)

      request.onsuccess = () => resolve(metadata)
      request.onerror = () => reject(request.error)
    })
  }
}

export { VideoMetadataController }
