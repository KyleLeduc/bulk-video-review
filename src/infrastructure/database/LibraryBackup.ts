import type {
  ILibraryBackup,
  LibraryBackupSummary,
} from '@app/ports/ILibraryBackup'
import { BUILD_IDENTITY } from '@/shared/buildIdentity'
import { LibraryMaintenance, libraryMaintenance } from './libraryMaintenance'
import {
  decodeLibraryArchive,
  encodeLibraryArchive,
  LIBRARY_STORES,
  type LibrarySnapshot,
} from './libraryArchive'

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Backup transaction aborted'))
    // Abort, not request success, is the transaction-level failure boundary.
    transaction.onerror = () => {}
  })
}
async function readStores(
  db: IDBDatabase,
  names: string[],
): Promise<Record<string, unknown[]>> {
  const transaction = db.transaction(names, 'readonly')
  const done = transactionDone(transaction)
  const result: Record<string, unknown[]> = {}
  for (const name of names) {
    const request = transaction.objectStore(name).getAll()
    request.onsuccess = () => {
      result[name] = request.result
    }
  }
  await done
  return result
}
async function replaceStores(
  db: IDBDatabase,
  rows: Record<string, unknown[]>,
): Promise<void> {
  const transaction = db.transaction(Object.keys(rows), 'readwrite')
  const done = transactionDone(transaction)
  try {
    for (const [name, records] of Object.entries(rows)) {
      const store = transaction.objectStore(name)
      store.clear()
      for (const row of records) store.put(row)
    }
  } catch (error) {
    transaction.abort()
    await done.catch(() => {})
    throw error
  }
  await done
}
function checkStores(db: IDBDatabase, version: number, names: string[]) {
  const actual = Array.from(db.objectStoreNames).sort()
  if (
    db.version !== version ||
    JSON.stringify(actual) !== JSON.stringify([...names].sort())
  )
    throw new Error('Unsupported live database schema; no data was replaced')
  const transaction = db.transaction(names, 'readonly')
  for (const name of names) {
    const store = transaction.objectStore(name)
    const expected =
      name === 'products'
        ? 'key'
        : name === 'VideoPreviewFrames'
          ? 'videoId'
          : 'id'
    if (store.keyPath !== expected || store.autoIncrement)
      throw new Error('Unsupported database keys; no data was replaced')
  }
}

/** All authoritative stores commit together. Cache rollback + durable latch cover split DB failures. */
export class LibraryBackup implements ILibraryBackup {
  constructor(
    private readonly connectLibrary: () => Promise<IDBDatabase>,
    private readonly connectCache: () => Promise<IDBDatabase>,
    private readonly gate: LibraryMaintenance = libraryMaintenance,
  ) {}
  recoveryRequired() {
    return this.gate.recoveryRequired()
  }
  async createArchive(): Promise<Blob> {
    this.gate.begin()
    try {
      const library = await this.connectLibrary()
      const cache = await this.connectCache()
      checkStores(library, 4, [...LIBRARY_STORES])
      checkStores(cache, 1, ['products'])
      const snapshot: LibrarySnapshot = {
        version: 1,
        libraryVersion: library.version,
        cacheVersion: cache.version,
        createdAt: new Date().toISOString(),
        build: { ...BUILD_IDENTITY },
        library: (await readStores(library, [
          ...LIBRARY_STORES,
        ])) as LibrarySnapshot['library'],
        cache: (await readStores(cache, ['products'])).products,
      }
      return await encodeLibraryArchive(snapshot)
    } finally {
      this.gate.end()
    }
  }
  async inspectArchive(archive: Blob): Promise<LibraryBackupSummary> {
    const snapshot = await decodeLibraryArchive(archive)
    return {
      createdAt: snapshot.createdAt,
      build: snapshot.build,
      libraryVersion: snapshot.libraryVersion,
      cacheVersion: snapshot.cacheVersion,
      counts: {
        ...Object.fromEntries(
          Object.entries(snapshot.library).map(([name, records]) => [
            name,
            records.length,
          ]),
        ),
        previewProducts: snapshot.cache.length,
      },
      archiveBytes: archive.size,
    }
  }
  async restoreArchive(archive: Blob): Promise<void> {
    const wasInterrupted = this.gate.recoveryRequired()
    this.gate.begin(true)
    let marked = false
    let changedCache = false
    let mainCommitted = false
    let previousCache: Record<string, unknown[]> | undefined
    let cache: IDBDatabase | undefined
    try {
      // Every checksum and record is validated before the marker or a store changes.
      const snapshot = await decodeLibraryArchive(archive)
      const library = await this.connectLibrary()
      cache = await this.connectCache()
      checkStores(library, 4, [...LIBRARY_STORES])
      checkStores(cache, 1, ['products'])
      previousCache = await readStores(cache, ['products'])
      this.gate.markRestore()
      marked = true
      await replaceStores(cache, { products: snapshot.cache })
      changedCache = true
      await replaceStores(library, snapshot.library)
      mainCommitted = true
      this.gate.requireReload()
      this.gate.clearRestore()
    } catch (error) {
      if (mainCommitted)
        throw new Error(
          'Library and previews committed, but recovery marker cleanup failed. Reload and restore the same archive again before continuing.',
        )
      if (changedCache && previousCache && cache) {
        try {
          await replaceStores(cache, previousCache)
        } catch {
          throw new Error(
            'Library was not replaced, but preview rollback failed. Recovery is required: reload and restore the intended or safety archive.',
          )
        }
      }
      // Never clear a marker that predates this attempt: the earlier crash remains unresolved.
      if (marked && !wasInterrupted) this.gate.clearRestore()
      throw error
    } finally {
      this.gate.end()
    }
  }
}
