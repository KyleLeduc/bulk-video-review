import type { MetadataEntity } from '@domain/entities'
import type { IMetadataRepository } from '@domain/repositories'
import { storeNames } from '@domain/constants'
import type { DatabaseConnection } from '../database/DatabaseConnection'

class MetadataRepository implements IMetadataRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getMetadata(id: string): Promise<MetadataEntity | undefined> {
    const store = await this.db.getStore(storeNames.metadata)

    return new Promise((resolve, reject) => {
      const request = store.get(id)

      request.onsuccess = () =>
        resolve(request.result ? (request.result as MetadataEntity) : undefined)
      request.onerror = () => reject(request.error!)
    })
  }

  async getAllMetadata(): Promise<MetadataEntity[]> {
    const store = await this.db.getStore(storeNames.metadata)

    return new Promise((resolve, reject) => {
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result as MetadataEntity[])
      request.onerror = () => reject(request.error!)
    })
  }

  async upsertMetadata(data: MetadataEntity): Promise<MetadataEntity> {
    const store = await this.db.getStore(storeNames.metadata, 'readwrite')

    return new Promise((resolve, reject) => {
      const request = store.put(data)

      request.onsuccess = () => resolve(data)
      request.onerror = () => reject(request.error!)
    })
  }

  async deleteMetadata(id: string): Promise<void> {
    const store = await this.db.getStore(storeNames.metadata, 'readwrite')

    return new Promise((resolve, reject) => {
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error!)
    })
  }
}

export { MetadataRepository }
