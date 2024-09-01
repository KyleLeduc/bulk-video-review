import type { ParsedVideo, VideoEntity } from '@/types'
import { getAllFromStore, transactionComplete } from '../utils'

/**
 * Converts ParsedVideo to VideoDto
 *
 * @param parsedVideos old video schema
 * @returns translated videos
 */
const handleParsedVideoTranslation = (
  parsedVideos: ParsedVideo[]
): VideoEntity[] => {
  const videoEntities: VideoEntity[] = []

  for (const video of parsedVideos) {
    const { id, title, thumb, duration, thumbUrls, tags } = video
    const videoEntity: VideoEntity = {
      id,
      title,
      thumb,
      duration,
      thumbUrls,
      tags,
    }

    videoEntities.push(videoEntity)
  }

  return videoEntities
}

/**
 * ParsedVideo => VideoDto migration
 * @param request The request from the migration
 */
export const handleParsedVideoMigration = async (request: IDBOpenDBRequest) => {
  console.log('parsed migration')
  const db = request.result
  if (!db.objectStoreNames.contains('videoCacheDto')) {
    db.createObjectStore('videoCacheDto', { keyPath: 'id' })
  }

  if (db.objectStoreNames.contains('parsedVideo')) {
    // get the current transaction
    const transaction = request.transaction
    if (!transaction) {
      return
    }
    // access relevant stores
    const parsedVideoStore = transaction.objectStore('parsedVideo')
    const videoCacheDtoStore = transaction.objectStore('videoCacheDto')

    try {
      // act perform migrations in a try catch to handle errors
      const parsedVideos = await getAllFromStore<ParsedVideo>(parsedVideoStore)
      const videoEntities = handleParsedVideoTranslation(parsedVideos)

      for (const videoEntity of videoEntities) {
        videoCacheDtoStore.add(videoEntity)
      }

      await transactionComplete(transaction)
    } catch (e) {
      console.error('Migration error:', e)
    }
  }
}
