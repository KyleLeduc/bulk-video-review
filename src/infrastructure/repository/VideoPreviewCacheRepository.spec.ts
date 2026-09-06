import { afterEach, expect, it, vi } from 'vitest'
import {
  VideoPreviewCacheRepository,
  selectCacheEvictions,
} from './VideoPreviewCacheRepository'
import {
  KEYFRAME_PREVIEW_VERSION,
  MOTION_PREVIEW_VERSION,
  motionClipWindows,
} from '@domain/services/videoPreviewPolicy'
import { buildLogger } from '@test-utils/index'

afterEach(() => vi.unstubAllGlobals())
const product = {
  kind: 'keyframes' as const,
  version: KEYFRAME_PREVIEW_VERSION,
  items: [
    {
      timestampSeconds: 0,
      width: 160,
      height: 90,
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    },
  ],
}

function readFixture() {
  const open = {} as IDBOpenDBRequest
  const reads: IDBRequest[] = []
  const transaction = {
    oncomplete: null,
    onabort: null,
    onerror: null,
    abort: vi.fn(() =>
      queueMicrotask(() => transaction.onabort?.(new Event('abort'))),
    ),
    objectStore: () => store,
  } as unknown as IDBTransaction
  const store = {
    transaction,
    get: vi.fn(() => {
      const request = {} as IDBRequest
      reads.push(request)
      return request
    }),
    put: vi.fn(),
  }
  vi.stubGlobal('indexedDB', { open: vi.fn(() => open) })
  const logger = buildLogger()
  const cache = new VideoPreviewCacheRepository(logger)
  const pending = cache.getProducts('id', 10)
  const opened = async () => {
    Object.assign(open, {
      result: { transaction: () => transaction, close: vi.fn() },
    })
    open.onsuccess?.(new Event('success'))
    await Promise.resolve()
    await Promise.resolve()
  }
  const reply = (index: number, value: unknown) => {
    Object.assign(reads[index], { result: value })
    reads[index].onsuccess?.(new Event('success'))
  }
  return { cache, pending, opened, reads, reply, transaction, store, logger }
}

it('keeps valid cache hits if their optional last-used update fails', async () => {
  const f = readFixture()
  await f.opened()
  f.reply(0, undefined)
  f.store.put.mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  expect(() => f.reply(1, { duration: 10, product })).not.toThrow()
  await expect(f.pending).resolves.toMatchObject({
    keyframes: product.items,
    previewVersions: { keyframes: KEYFRAME_PREVIEW_VERSION },
  })
  expect(f.logger.warn).toHaveBeenCalled()
})
it.each(['wrong-version', 'short', 'wrong-duration'] as const)(
  'ignores %s cache records',
  async (kind) => {
    const f = readFixture()
    await f.opened()
    f.reply(0, undefined)
    f.reply(1, {
      duration: kind === 'wrong-duration' ? 20 : 10,
      product: {
        ...product,
        version: kind === 'wrong-version' ? 'old' : product.version,
        items: kind === 'short' ? [] : product.items,
      },
    })
    f.transaction.oncomplete?.(new Event('complete'))
    expect((await f.pending).keyframes).toEqual([])
  },
)
it('hydrates independently keyed valid products without loading unrelated Blob values', async () => {
  const f = readFixture()
  await f.opened()
  const clips = motionClipWindows(10).map(({ start, end }) => ({
    timestampSeconds: start,
    durationSeconds: end - start,
    width: 320,
    height: 180,
    blob: new Blob(['mp4'], { type: 'video/mp4' }),
  }))
  f.reply(0, {
    duration: 10,
    product: {
      kind: 'motionClips',
      version: MOTION_PREVIEW_VERSION,
      items: clips,
    },
  })
  f.reply(1, { duration: 10, product })
  f.transaction.oncomplete?.(new Event('complete'))
  await expect(f.pending).resolves.toEqual({
    motionClips: clips,
    keyframes: product.items,
    previewVersions: {
      motionClips: MOTION_PREVIEW_VERSION,
      keyframes: KEYFRAME_PREVIEW_VERSION,
    },
  })
  expect(f.store.get.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
    JSON.stringify(['id', 'motionClips', MOTION_PREVIEW_VERSION]),
    JSON.stringify(['id', 'keyframes', KEYFRAME_PREVIEW_VERSION]),
  ])
})

function pendingOpenFixture() {
  const request = {} as IDBOpenDBRequest
  const transactions: IDBTransaction[] = []
  const cursor = {} as IDBRequest
  const store = {
    clear: vi.fn(),
    put: vi.fn(),
    index: () => ({ openKeyCursor: () => cursor }),
  }
  const db = {
    close: vi.fn(),
    transaction: vi.fn(() => {
      const transaction = {
        objectStore: () => store,
        abort: vi.fn(() =>
          queueMicrotask(() => transaction.onabort?.(new Event('abort'))),
        ),
        oncomplete: null,
        onabort: null,
        onerror: null,
      } as unknown as IDBTransaction
      transactions.push(transaction)
      return transaction
    }),
  }
  vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
  const cache = new VideoPreviewCacheRepository(buildLogger())
  const opened = async () => {
    Object.assign(request, { result: db })
    request.onsuccess?.(new Event('success'))
    await Promise.resolve()
    await Promise.resolve()
  }
  return { cache, opened, store, transactions, cursor }
}
it('invalidates a put awaiting the database open when wiped', async () => {
  const f = pendingOpenFixture()
  const write = f.cache.putProduct('id', 10, product, {
    epoch: 0,
    signal: new AbortController().signal,
  })
  const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' })
  const clear = f.cache.clear()
  await f.opened()
  await rejected
  expect(f.store.put).not.toHaveBeenCalled()
  expect(f.store.clear).toHaveBeenCalledOnce()
  f.transactions.at(-1)!.oncomplete?.(new Event('complete'))
  await clear
})
it('invalidates a hydration awaiting the database open when wiped', async () => {
  const f = pendingOpenFixture()
  const read = f.cache.getProducts('id', 10)
  const clear = f.cache.clear()
  await f.opened()
  await expect(read).resolves.toEqual({
    motionClips: [],
    keyframes: [],
    previewVersions: {},
  })
  f.transactions.at(-1)!.oncomplete?.(new Event('complete'))
  await clear
})
it('aborts an active write before clearing the cache', async () => {
  const f = pendingOpenFixture()
  const write = f.cache.putProduct('id', 10, product, {
    epoch: 0,
    signal: new AbortController().signal,
  })
  const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' })
  await f.opened()
  const first = f.transactions[0]
  const clear = f.cache.clear()
  await Promise.resolve()
  await Promise.resolve()
  expect(first.abort).toHaveBeenCalledOnce()
  await rejected
  expect(f.store.clear).toHaveBeenCalledOnce()
  f.transactions.at(-1)!.oncomplete?.(new Event('complete'))
  await clear
})

it('accounts for replacements and evicts only oldest generated products within its byte budget', () => {
  const entries = [
    { key: 'old', bytes: 4 },
    { key: 'replace', bytes: 5 },
    { key: 'new', bytes: 3 },
  ]
  expect(selectCacheEvictions(entries, 'replace', 2, 10)).toEqual([])
  expect(selectCacheEvictions(entries, 'replace', 7, 10)).toEqual(['old'])
  expect(() => selectCacheEvictions(entries, 'replace', 11, 10)).toThrow(
    'cache-product-too-large',
  )
})
it('opens lazily, keeps metadata DB untouched and invalidates pre-wipe writes before opening', async () => {
  const open = vi.fn(() => {
    throw new Error('unavailable')
  })
  vi.stubGlobal('indexedDB', { open })
  const cache = new VideoPreviewCacheRepository(buildLogger())
  expect(open).not.toHaveBeenCalled()
  const epoch = cache.epoch
  await expect(cache.clear()).rejects.toThrow('unavailable')
  expect(cache.epoch).toBe(epoch + 1)
  await expect(
    cache.putProduct('id', 10, product, {
      epoch,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(open).toHaveBeenCalledExactlyOnceWith('BVRPreviewCache-v1', 1)
})
it('rejects wrong recipes and partial sets before any database writes', async () => {
  const open = vi.fn()
  vi.stubGlobal('indexedDB', { open })
  const cache = new VideoPreviewCacheRepository(buildLogger())
  await expect(
    cache.putProduct('id', 60, product, {
      epoch: cache.epoch,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('invalid-preview-product')
  expect(open).not.toHaveBeenCalled()
})
it('rejects blocked opens without reading the pending error getter, closes late handles and permits retry', async () => {
  const request = {} as IDBOpenDBRequest
  Object.defineProperty(request, 'error', {
    get: () => {
      throw new DOMException('pending', 'InvalidStateError')
    },
  })
  const open = vi.fn(() => request)
  vi.stubGlobal('indexedDB', { open })
  const cache = new VideoPreviewCacheRepository(buildLogger())
  const pending = cache.getProducts('id', 10)
  expect(() =>
    request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent),
  ).not.toThrow()
  await expect(pending).rejects.toThrow('preview-cache-blocked')
  const close = vi.fn()
  Object.assign(request, { result: { close } })
  request.onsuccess?.(new Event('success'))
  expect(close).toHaveBeenCalledOnce()
  const retry = cache.getProducts('id', 10)
  request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)
  await expect(retry).rejects.toThrow('preview-cache-blocked')
  expect(open).toHaveBeenCalledTimes(2)
})

// Drive request success and transaction completion separately: a put request is not a commit.
it('waits for transaction commit and rejects an abort after request success', async () => {
  const request = {} as IDBOpenDBRequest
  const cursorRequest = {} as IDBRequest
  const transaction = {
    oncomplete: null,
    onabort: null,
    onerror: null,
    error: new DOMException('quota', 'QuotaExceededError'),
    objectStore: () => store,
  } as unknown as IDBTransaction
  const store = {
    index: () => ({ openKeyCursor: () => cursorRequest }),
    put: vi.fn(),
    delete: vi.fn(),
  }
  vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
  const cache = new VideoPreviewCacheRepository(buildLogger())
  const pending = cache.putProduct('id', 10, product, {
    epoch: 0,
    signal: new AbortController().signal,
  })
  Object.assign(request, {
    result: { transaction: () => transaction, close: vi.fn() },
  })
  request.onsuccess?.(new Event('success'))
  await Promise.resolve()
  await Promise.resolve()
  Object.assign(cursorRequest, { result: null })
  cursorRequest.onsuccess?.(new Event('success'))
  expect(store.put).toHaveBeenCalledOnce()
  let settled = false
  void pending.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await Promise.resolve()
  expect(settled).toBe(false)
  transaction.onabort?.(new Event('abort'))
  await expect(pending).rejects.toMatchObject({ name: 'QuotaExceededError' })
})
