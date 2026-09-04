import type { VideoPreviewFrame } from '@domain/entities'
import type { IVideoPreviewRepository } from '@domain/repositories'
import { storeNames } from '@domain/constants'
import type { DatabaseConnection } from '@infra/database/DatabaseConnection'

type VideoPreviewRecord = {
  videoId: string
  frames: VideoPreviewFrame[]
}

const waitForRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'))
  })

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new DOMException('IndexedDB transaction aborted', 'AbortError'),
      )
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })

export class VideoPreviewRepository implements IVideoPreviewRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getFrames(videoId: string): Promise<VideoPreviewFrame[]> {
    const store = await this.db.getStore(storeNames.videoPreviews)
    const record = await waitForRequest(
      store.get(videoId) as IDBRequest<VideoPreviewRecord | undefined>,
    )

    return [...(record?.frames ?? [])].sort(
      (left, right) => left.timestampSeconds - right.timestampSeconds,
    )
  }

  async replaceFrames(
    videoId: string,
    frames: VideoPreviewFrame[],
  ): Promise<void> {
    const store = await this.db.getStore(storeNames.videoPreviews, 'readwrite')
    const record: VideoPreviewRecord = {
      videoId,
      frames: [...frames],
    }

    const completion = waitForTransaction(store.transaction)
    store.put(record)
    await completion
  }

  async deleteFrames(videoId: string): Promise<void> {
    const store = await this.db.getStore(storeNames.videoPreviews, 'readwrite')
    const completion = waitForTransaction(store.transaction)
    store.delete(videoId)
    await completion
  }

  async clear(): Promise<void> {
    const store = await this.db.getStore(storeNames.videoPreviews, 'readwrite')
    const completion = waitForTransaction(store.transaction)
    store.clear()
    await completion
  }
}
