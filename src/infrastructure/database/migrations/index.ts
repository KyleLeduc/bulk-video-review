import { handleParsedVideoMigration } from './v1'
import { handleAddVideoMetadataStore } from './v2'
import { handleAddVideoIngestionFailuresStore } from './v3'

export const handleMigrations = (
  request: IDBOpenDBRequest,
  oldVersion: number,
) => {
  const db = request.result

  if (oldVersion === 0 && !db.objectStoreNames.contains('parsedVideo')) {
    db.createObjectStore('parsedVideo', { keyPath: 'id' })
  }

  if (oldVersion < 1) {
    handleParsedVideoMigration(request)
  }

  if (oldVersion < 2) {
    handleAddVideoMetadataStore(request)
  }

  if (oldVersion < 3) {
    handleAddVideoIngestionFailuresStore(request)
  }
}
