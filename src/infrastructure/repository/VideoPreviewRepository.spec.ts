import { describe, expect, test } from 'vitest'
import type { DatabaseConnection } from '@infra/database/DatabaseConnection'
import type { VideoPreviewFrame } from '@domain/entities'
import { VideoPreviewRepository } from './VideoPreviewRepository'

type PreviewRecord = {
  videoId: string
  frames: VideoPreviewFrame[]
}

const createRequest = <T>(
  operation: () => T,
  transaction?: IDBTransaction,
): IDBRequest<T> => {
  const request = {
    error: null,
    onsuccess: null,
    onerror: null,
    result: undefined,
  } as unknown as IDBRequest<T>

  queueMicrotask(() => {
    try {
      Object.defineProperty(request, 'result', {
        configurable: true,
        value: operation(),
      })
      request.onsuccess?.(new Event('success') as unknown as Event)
      queueMicrotask(() => transaction?.oncomplete?.(new Event('complete')))
    } catch (error) {
      Object.defineProperty(request, 'error', {
        configurable: true,
        value: error,
      })
      request.onerror?.(new Event('error') as unknown as Event)
    }
  })

  return request
}

const createRepository = () => {
  const records = new Map<string, PreviewRecord>()
  const transaction = {} as IDBTransaction
  const store = {
    transaction,
    get: (videoId: string) => createRequest(() => records.get(videoId)),
    put: (record: PreviewRecord) =>
      createRequest(() => {
        records.set(record.videoId, record)
        return record.videoId
      }, transaction),
    delete: (videoId: string) =>
      createRequest(() => {
        records.delete(videoId)
        return undefined
      }, transaction),
    clear: () =>
      createRequest(() => {
        records.clear()
        return undefined
      }, transaction),
  } as unknown as IDBObjectStore

  const database = {
    getStore: async () => store,
  } as unknown as DatabaseConnection

  return {
    records,
    repository: new VideoPreviewRepository(database),
  }
}

const buildFrame = (
  timestampSeconds: number,
  value: string,
): VideoPreviewFrame => ({
  timestampSeconds,
  blob: new Blob([value], { type: 'image/jpeg' }),
  width: 480,
  height: 270,
})

describe('VideoPreviewRepository', () => {
  test.each(['replace', 'delete', 'clear'] as const)(
    '%s rejects a transaction abort even after its request succeeds',
    async (operation) => {
      const transaction = {} as IDBTransaction
      const request = {} as IDBRequest
      const store = {
        transaction,
        put: () => request,
        delete: () => request,
        clear: () => request,
      } as unknown as IDBObjectStore
      const repository = new VideoPreviewRepository({
        getStore: async () => store,
      } as unknown as DatabaseConnection)
      const write =
        operation === 'replace'
          ? repository.replaceFrames('video-1', [buildFrame(10, 'one')])
          : operation === 'delete'
            ? repository.deleteFrames('video-1')
            : repository.clear()
      const rejection = expect(write).rejects.toMatchObject({
        name: 'AbortError',
      })

      await Promise.resolve()
      request.onsuccess?.(new Event('success'))
      Object.defineProperty(transaction, 'error', {
        value: new DOMException('Late abort', 'AbortError'),
      })
      transaction.onabort?.(new Event('abort'))

      await rejection
    },
  )

  test('replaces and reads one ordered frame set without touching video metadata', async () => {
    const { records, repository } = createRepository()
    const frames = [buildFrame(20, 'later'), buildFrame(10, 'earlier')]

    await repository.replaceFrames('video-1', frames)

    expect(records.get('video-1')?.frames).toEqual(frames)
    await expect(repository.getFrames('video-1')).resolves.toEqual([
      frames[1],
      frames[0],
    ])
  })

  test('returns an empty frame set when no previews are persisted', async () => {
    const { repository } = createRepository()

    await expect(repository.getFrames('missing')).resolves.toEqual([])
  })

  test('deletes one video frame set without affecting another', async () => {
    const { records, repository } = createRepository()
    await repository.replaceFrames('video-1', [buildFrame(10, 'one')])
    await repository.replaceFrames('video-2', [buildFrame(20, 'two')])

    await repository.deleteFrames('video-1')

    expect(records.has('video-1')).toBe(false)
    expect(records.has('video-2')).toBe(true)
  })

  test('clears all persisted preview frame sets', async () => {
    const { records, repository } = createRepository()
    await repository.replaceFrames('video-1', [buildFrame(10, 'one')])
    await repository.replaceFrames('video-2', [buildFrame(20, 'two')])

    await repository.clear()

    expect(records.size).toBe(0)
  })
})
