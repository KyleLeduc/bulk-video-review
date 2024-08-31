import type { IMetadataRepository } from '../../domain/repositories/IMetadataRepository'
import type { MetadataEntity } from '../../domain/entities/Metadata'
import { DatabaseConnection } from '../database/DatabaseConnection'
import { storeNames } from '../../domain/constants'

class MetadataRepository implements IMetadataRepository {
  private db = DatabaseConnection.getInstance()

  async getMetadata(id: string): Promise<MetadataEntity> {
    const store = await this.db.getStore(storeNames.metadata)

    return new Promise((resolve, reject) => {
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result as MetadataEntity)
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
}

export { MetadataRepository }
