/* eslint-disable no-fallthrough */
import { handleParsedVideoMigration } from './v1'
import { handleAddVideoMetadataStore } from './v2'

export const handleMigrations = async (
  request: IDBOpenDBRequest,
  currentVersion: number
) => {
  const db = request.result
  switch (currentVersion) {
    case 0:
      if (!db.objectStoreNames.contains('parsedVideo')) {
        db.createObjectStore('parsedVideo', { keyPath: 'id' })
      }
    case 1:
      handleParsedVideoMigration(request)

    case 2:
      handleAddVideoMetadataStore(request)

      break

    // Add more cases as necessary for other versions
  }
}
