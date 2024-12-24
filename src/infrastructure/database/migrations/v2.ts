import type { VideoEntity } from '@domain/entities'
import { getAllFromStore, transactionComplete } from './utils'

export const handleAddVideoMetadataStore = async (
  request: IDBOpenDBRequest,
) => {
  console.log('Metadata migration')
  const db = request.result

  if (db.objectStoreNames.contains('videoCacheDto')) {
    // get the current transaction
    const transaction = request.transaction
    if (!transaction) return

    // make a store if not exists
    if (!db.objectStoreNames.contains('VideoMetadata')) {
      db.createObjectStore('VideoMetadata', { keyPath: 'id' })
    }
    if (db.objectStoreNames.contains('parsedVideo')) {
      db.deleteObjectStore('parsedVideo')
    }

    // access relevant stores
    const videoCacheDtoStore = transaction.objectStore('videoCacheDto')
    const videoMetadata = transaction.objectStore('VideoMetadata')

    try {
      // act perform migrations in a try catch to handle errors
      const videoEntities =
        await getAllFromStore<VideoEntity>(videoCacheDtoStore)

      for (const videoEntity of videoEntities) {
        const { id } = videoEntity
        videoMetadata.add({ id, votes: 0 })
      }

      await transactionComplete(transaction)
    } catch (e) {
      console.error('Migration error:', e)
    }
  }
}
