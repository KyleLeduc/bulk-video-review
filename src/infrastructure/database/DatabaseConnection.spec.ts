import { afterEach, describe, expect, test, vi } from 'vitest'

const createOpenRequest = (): IDBOpenDBRequest => ({}) as IDBOpenDBRequest

const resolveOpenRequest = (
  request: IDBOpenDBRequest,
  database: IDBDatabase,
) => {
  Object.defineProperty(request, 'result', {
    configurable: true,
    value: database,
  })
  request.onsuccess?.call(request, { target: request } as unknown as Event)
}

const importFreshConnection = async (
  open: (name: string, version?: number) => IDBOpenDBRequest,
) => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', { open })
  const { DatabaseConnection } = await import('./DatabaseConnection')
  return DatabaseConnection.getInstance()
}

describe('DatabaseConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('shares one pending connection between concurrent callers', async () => {
    const request = createOpenRequest()
    const open = vi.fn(() => request)
    const connection = await importFreshConnection(open)
    const database = {
      close: vi.fn(),
    } as unknown as IDBDatabase

    const first = connection.connect()
    const second = connection.connect()

    expect(open).toHaveBeenCalledOnce()
    resolveOpenRequest(request, database)
    await expect(first).resolves.toBe(database)
    await expect(second).resolves.toBe(database)
  })

  test('rejects a blocked upgrade with an actionable error', async () => {
    const request = createOpenRequest()
    const open = vi.fn(() => request)
    const connection = await importFreshConnection(open)

    const pending = connection.connect()
    const blockedExpectation = expect(pending).rejects.toThrow(/blocked/i)

    expect(request.onblocked).toBeTypeOf('function')
    request.onblocked?.call(
      request,
      new Event('blocked') as IDBVersionChangeEvent,
    )
    await blockedExpectation
  })

  test('opens a new request when retrying after a blocked upgrade', async () => {
    const firstRequest = createOpenRequest()
    const secondRequest = createOpenRequest()
    const open = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest)
    const connection = await importFreshConnection(open)
    const database = {
      close: vi.fn(),
    } as unknown as IDBDatabase

    const blockedConnection = connection.connect()
    const blockedExpectation =
      expect(blockedConnection).rejects.toThrow(/blocked/i)
    firstRequest.onblocked?.call(
      firstRequest,
      new Event('blocked') as IDBVersionChangeEvent,
    )
    await blockedExpectation

    const retryConnection = connection.connect()
    expect(open).toHaveBeenCalledTimes(2)
    resolveOpenRequest(secondRequest, database)
    await expect(retryConnection).resolves.toBe(database)
  })

  test('closes a late successful database from an abandoned blocked request', async () => {
    const firstRequest = createOpenRequest()
    const secondRequest = createOpenRequest()
    const open = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest)
    const connection = await importFreshConnection(open)
    const staleDatabase = {
      close: vi.fn(),
    } as unknown as IDBDatabase
    const currentDatabase = {
      close: vi.fn(),
    } as unknown as IDBDatabase

    const blockedConnection = connection.connect()
    const blockedExpectation =
      expect(blockedConnection).rejects.toThrow(/blocked/i)
    firstRequest.onblocked?.call(
      firstRequest,
      new Event('blocked') as IDBVersionChangeEvent,
    )
    await blockedExpectation

    const retryConnection = connection.connect()
    resolveOpenRequest(firstRequest, staleDatabase)
    expect(staleDatabase.close).toHaveBeenCalledOnce()

    resolveOpenRequest(secondRequest, currentDatabase)
    await expect(retryConnection).resolves.toBe(currentDatabase)
  })

  test('closes a stale connection on versionchange and reconnects', async () => {
    const firstRequest = createOpenRequest()
    const secondRequest = createOpenRequest()
    const open = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest)
    const connection = await importFreshConnection(open)
    const firstDatabase = {
      close: vi.fn(),
      onversionchange: null,
    } as unknown as IDBDatabase
    const secondDatabase = {
      close: vi.fn(),
      onversionchange: null,
    } as unknown as IDBDatabase

    const firstConnection = connection.connect()
    resolveOpenRequest(firstRequest, firstDatabase)
    await expect(firstConnection).resolves.toBe(firstDatabase)

    expect(firstDatabase.onversionchange).toBeTypeOf('function')
    firstDatabase.onversionchange?.(
      new Event('versionchange') as IDBVersionChangeEvent,
    )
    expect(firstDatabase.close).toHaveBeenCalledOnce()

    const secondConnection = connection.connect()
    expect(open).toHaveBeenCalledTimes(2)
    resolveOpenRequest(secondRequest, secondDatabase)
    await expect(secondConnection).resolves.toBe(secondDatabase)
  })
})
