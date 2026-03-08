import { storeNames } from '@domain/constants'

export const handleAddVideoIngestionFailuresStore = (
  request: IDBOpenDBRequest,
) => {
  const db = request.result

  if (!db.objectStoreNames.contains(storeNames.ingestionFailures)) {
    db.createObjectStore(storeNames.ingestionFailures, { keyPath: 'id' })
  }
}
