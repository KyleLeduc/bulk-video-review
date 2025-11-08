import type { VideoEntity } from '@domain/entities'
import type { IVideoRepository } from '@domain/repositories'
import { storeNames } from '@domain/constants'
import type { DatabaseConnection } from '../database/DatabaseConnection'

class VideoRepository implements IVideoRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getVideo(id: string): Promise<VideoEntity | undefined> {
    const store = await this.db.getStore(storeNames.video)

    return new Promise((resolve, reject) => {
      const request = store.get(id)

      request.onsuccess = () =>
        resolve(request.result ? (request.result as VideoEntity) : undefined)
      request.onerror = () => reject(request.error!)
    })
  }

  async getAllVideos(): Promise<VideoEntity[]> {
    const store = await this.db.getStore(storeNames.video)

    return new Promise((resolve, reject) => {
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result as VideoEntity[])
      request.onerror = () => reject(request.error!)
    })
  }

  async postVideo(data: VideoEntity): Promise<VideoEntity> {
    const store = await this.db.getStore(storeNames.video, 'readwrite')

    return new Promise((resolve, reject) => {
      const request = store.put(data)

      request.onsuccess = () => resolve(data)
      request.onerror = () => reject(request.error!)
    })
  }

  async deleteVideo(id: string): Promise<void> {
    const store = await this.db.getStore(storeNames.video, 'readwrite')

    return new Promise((resolve, reject) => {
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error!)
    })
  }
}

export { VideoRepository }
