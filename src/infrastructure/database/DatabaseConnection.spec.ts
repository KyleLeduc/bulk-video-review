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
  const pairId = '12345678-1234-4123-8123-123456789abc'

  test('keeps production and each benchmark connection distinct with constrained names', async () => {
    const open = vi.fn(() => createOpenRequest())
    const production = await importFreshConnection(open)
    const { DatabaseConnection } = await import('./DatabaseConnection')
    const benchmark = DatabaseConnection.forBenchmark(pairId)
    expect(benchmark).not.toBe(production)
    expect(DatabaseConnection.forBenchmark(pairId)).not.toBe(benchmark)
    void production.connect()
    void benchmark.connect()
    expect(open.mock.calls).toEqual([
      ['VideoMetaDataDB', 4],
      [`BVRBenchmark-v1-${pairId}`, 4],
    ])
    for (const invalid of [
      'VideoMetaDataDB',
      '../x',
      '',
      '12345678-1234-1123-8123-123456789abc',
    ]) {
      expect(() => DatabaseConnection.forBenchmark(invalid)).toThrow(/UUID/)
      await expect(DatabaseConnection.deleteBenchmark(invalid)).rejects.toThrow(
        /UUID/,
      )
    }
  })

  test('disposal rejects a pending open and closes a late handle permanently', async () => {
    const request = createOpenRequest()
    const connection = await importFreshConnection(vi.fn(() => request))
    const pending = expect(connection.connect()).rejects.toThrow(/disposed/i)
    connection.close()
    await pending
    const database = { close: vi.fn() } as unknown as IDBDatabase
    resolveOpenRequest(request, database)
    expect(database.close).toHaveBeenCalledOnce()
    await expect(connection.connect()).rejects.toThrow(/disposed/i)
  })

  test('closes an established handle and never reopens it', async () => {
    const request = createOpenRequest()
    const connection = await importFreshConnection(vi.fn(() => request))
    const database = { close: vi.fn() } as unknown as IDBDatabase
    const pending = connection.connect()
    resolveOpenRequest(request, database)
    await pending
    connection.close()
    connection.close()
    expect(database.close).toHaveBeenCalledOnce()
    await expect(connection.connect()).rejects.toThrow(/disposed/i)
  })

  test('deletes only the owned UUID name and surfaces blocked deletion', async () => {
    await importFreshConnection(vi.fn())
    const { DatabaseConnection } = await import('./DatabaseConnection')
    const request = createOpenRequest()
    const deleteDatabase = vi.fn(() => request)
    vi.stubGlobal('indexedDB', { deleteDatabase })
    const deletion = DatabaseConnection.deleteBenchmark(pairId.toUpperCase())
    expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(
      `BVRBenchmark-v1-${pairId}`,
    )
    request.onsuccess?.call(request, new Event('success'))
    await expect(deletion).resolves.toBeUndefined()
    const blocked = expect(
      DatabaseConnection.deleteBenchmark(pairId),
    ).rejects.toThrow(/blocked/i)
    request.onblocked?.call(
      request,
      new Event('blocked') as IDBVersionChangeEvent,
    )
    await blocked
  })
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
