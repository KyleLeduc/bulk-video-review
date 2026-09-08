import { describe, expect, test, vi } from 'vitest'
import type { DatabaseConnection } from '@infra/database/DatabaseConnection'
import { MetadataRepository } from './MetadataRepository'

function createFixture() {
  const request = {} as IDBRequest
  const transaction = { abort: vi.fn() } as unknown as IDBTransaction
  const store = {
    transaction,
    get: vi.fn(() => request),
    add: vi.fn(),
    put: vi.fn(),
  }
  const getStore = vi.fn(async () => store)
  const repository = new MetadataRepository({
    getStore,
  } as unknown as DatabaseConnection)
  return { repository, store, getStore, request, transaction }
}

describe('MetadataRepository.createMetadata', () => {
  test.each([17, -4, 0])(
    'preserves an existing %s-vote record without rewriting it',
    async (votes) => {
      const f = createFixture()
      const existing = { id: 'saved', votes }
      const settled = vi.fn()
      const pending = f.repository
        .createMetadata({ id: 'saved', votes: 0 })
        .then(settled)
      await Promise.resolve()
      Object.defineProperty(f.request, 'result', { value: existing })
      f.request.onsuccess?.(new Event('success'))
      await Promise.resolve()
      expect(settled).not.toHaveBeenCalled()
      expect(f.getStore).toHaveBeenCalledWith('VideoMetadata', 'readwrite')
      expect(f.store.get).toHaveBeenCalledWith('saved')
      expect(f.store.add).not.toHaveBeenCalled()
      expect(f.store.put).not.toHaveBeenCalled()

      f.transaction.oncomplete?.(new Event('complete'))
      await pending
      expect(settled).toHaveBeenCalledWith(existing)
    },
  )

  test('inserts an absent record in the same transaction and waits for commit', async () => {
    const f = createFixture()
    const data = { id: 'new', votes: 0 }
    const settled = vi.fn()
    const pending = f.repository.createMetadata(data).then(settled)
    await Promise.resolve()
    Object.defineProperty(f.request, 'result', { value: undefined })
    f.request.onsuccess?.(new Event('success'))
    await Promise.resolve()
    expect(f.store.add).toHaveBeenCalledExactlyOnceWith(data)
    expect(f.store.put).not.toHaveBeenCalled()
    expect(settled).not.toHaveBeenCalled()

    f.transaction.oncomplete?.(new Event('complete'))
    await pending
    expect(settled).toHaveBeenCalledWith(data)
  })

  test('rejects a transaction abort after a successful lookup', async () => {
    const f = createFixture()
    const pending = expect(
      f.repository.createMetadata({ id: 'new', votes: 0 }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    f.request.onsuccess?.(new Event('success'))
    Object.defineProperty(f.transaction, 'error', {
      value: new DOMException('Late failure', 'AbortError'),
    })
    f.transaction.onabort?.(new Event('abort'))
    await pending
  })

  test('surfaces a read request failure when its transaction aborts', async () => {
    const f = createFixture()
    const error = new DOMException('Read failed', 'UnknownError')
    const pending = expect(
      f.repository.createMetadata({ id: 'new', votes: 0 }),
    ).rejects.toBe(error)
    await Promise.resolve()
    Object.defineProperty(f.transaction, 'error', { value: error })
    f.transaction.onerror?.(new Event('error'))
    f.transaction.onabort?.(new Event('abort'))
    await pending
    expect(f.store.add).not.toHaveBeenCalled()
  })

  test('aborts and surfaces a synchronous insertion failure', async () => {
    const f = createFixture()
    const error = new DOMException('Cannot clone', 'DataCloneError')
    f.store.add.mockImplementation(() => {
      throw error
    })
    const pending = expect(
      f.repository.createMetadata({ id: 'new', votes: 0 }),
    ).rejects.toBe(error)
    await Promise.resolve()
    f.request.onsuccess?.(new Event('success'))
    expect(f.transaction.abort).toHaveBeenCalledOnce()
    f.transaction.onabort?.(new Event('abort'))
    await pending
  })
})
