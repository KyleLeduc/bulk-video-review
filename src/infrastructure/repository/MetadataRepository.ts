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

  async createMetadata(data: MetadataEntity): Promise<MetadataEntity> {
    // Keep the check and insert in one transaction: concurrent imports must not
    // initialize over review metadata that another import or vote just saved.
    const store = await this.db.getStore(storeNames.metadata, 'readwrite')
    const transaction = store.transaction

    return new Promise((resolve, reject) => {
      let metadata = data
      let insertionError: unknown
      transaction.oncomplete = () => resolve(metadata)
      transaction.onabort = () =>
        reject(
          insertionError ??
            transaction.error ??
            new Error('Metadata creation aborted'),
        )
      // Request errors keep their default abort behavior; settle at the transaction boundary.
      transaction.onerror = () => {}

      const request = store.get(data.id)
      request.onsuccess = () => {
        if (request.result !== undefined) {
          metadata = request.result as MetadataEntity
          return
        }
        try {
          store.add(data)
        } catch (error) {
          insertionError = error
          transaction.abort()
        }
      }
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
