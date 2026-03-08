import type { IVideoIngestionFailureTracker } from '@app/ports'
import { storeNames } from '@domain/constants'
import type { DatabaseConnection } from '@infra/database/DatabaseConnection'

type IngestionFailureRecord = {
  id: string
  failureCount: number
  lastFailureAt: string
}

export class VideoIngestionFailureTracker
  implements IVideoIngestionFailureTracker
{
  constructor(private readonly db: DatabaseConnection) {}

  async hasFailure(videoId: string): Promise<boolean> {
    const record = await this.getRecord(videoId)
    return Boolean(record)
  }

  async recordFailure(videoId: string): Promise<void> {
    const existing = await this.getRecord(videoId)
    const nextRecord: IngestionFailureRecord = {
      id: videoId,
      failureCount: (existing?.failureCount ?? 0) + 1,
      lastFailureAt: new Date().toISOString(),
    }
    const store = await this.db.getStore(
      storeNames.ingestionFailures,
      'readwrite',
    )

    await new Promise<void>((resolve, reject) => {
      const request = store.put(nextRecord)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error!)
    })
  }

  async clearFailure(videoId: string): Promise<void> {
    const store = await this.db.getStore(
      storeNames.ingestionFailures,
      'readwrite',
    )

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(videoId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error!)
    })
  }

  private async getRecord(
    videoId: string,
  ): Promise<IngestionFailureRecord | undefined> {
    const store = await this.db.getStore(storeNames.ingestionFailures)

    return new Promise((resolve, reject) => {
      const request = store.get(videoId)

      request.onsuccess = () =>
        resolve(
          request.result
            ? (request.result as IngestionFailureRecord)
            : undefined,
        )
      request.onerror = () => reject(request.error!)
    })
  }
}
