import { storeNames } from '@domain/constants'

export const handleAddVideoPreviewFramesStore = (request: IDBOpenDBRequest) => {
  const db = request.result

  if (!db.objectStoreNames.contains(storeNames.videoPreviews)) {
    db.createObjectStore(storeNames.videoPreviews, { keyPath: 'videoId' })
  }
}
