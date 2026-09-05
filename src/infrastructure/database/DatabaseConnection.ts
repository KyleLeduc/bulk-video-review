import { handleMigrations } from './migrations'

const benchmarkDatabaseName = (pairId: string): string => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      pairId,
    )
  )
    throw new TypeError('Expected a benchmark pair UUID')
  return `BVRBenchmark-v1-${pairId.toLowerCase()}`
}

class DatabaseConnection {
  private static instance: DatabaseConnection
  private dbName = 'VideoMetaDataDB'
  private dbVersion = 4
  private db: IDBDatabase | null = null
  private connectionPromise: Promise<IDBDatabase> | null = null
  private activeConnectionAttempt: symbol | null = null
  private disposed = false
  private rejectPending: ((error: Error) => void) | null = null

  private constructor() {}

  public static forBenchmark(pairId: string): DatabaseConnection {
    const connection = new DatabaseConnection()
    connection.dbName = benchmarkDatabaseName(pairId)
    return connection
  }

  public static async deleteBenchmark(pairId: string): Promise<void> {
    const name = benchmarkDatabaseName(pairId)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(
          new Error(
            `Benchmark database deletion failed: ${request.error?.message ?? 'unknown error'}`,
          ),
        )
      request.onblocked = () =>
        reject(new Error(`Benchmark database deletion blocked: ${name}`))
    })
  }

  /** Permanently retires this connection, including any pending open. */
  public close(): void {
    this.disposed = true
    this.rejectPending?.(new Error('Database connection disposed'))
    this.rejectPending = null
    this.activeConnectionAttempt = null
    this.db?.close()
    this.db = null
    this.connectionPromise = null
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection()
    }
    return DatabaseConnection.instance
  }

  public async connect(): Promise<IDBDatabase> {
    if (this.disposed) throw new Error('Database connection disposed')
    if (this.db) {
      return this.db
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    const attempt = Symbol('indexed-db-connection-attempt')
    this.activeConnectionAttempt = attempt

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(this.dbName, this.dbVersion)
    } catch (error) {
      this.activeConnectionAttempt = null
      throw error
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      let settled = false

      const clearAttempt = () => {
        if (this.activeConnectionAttempt === attempt) {
          this.activeConnectionAttempt = null
          this.connectionPromise = null
          this.rejectPending = null
        }
      }

      const rejectAttempt = (error: Error) => {
        if (settled) {
          return
        }

        settled = true
        clearAttempt()
        reject(error)
      }
      this.rejectPending = rejectAttempt

      request.onupgradeneeded = (event) => {
        if (this.disposed) {
          request.transaction?.abort()
          return
        }
        handleMigrations(request, event.oldVersion)
      }

      request.onsuccess = () => {
        const database = request.result
        if (settled || this.activeConnectionAttempt !== attempt) {
          database.close()
          return
        }

        settled = true
        this.activeConnectionAttempt = null
        this.rejectPending = null
        database.onversionchange = () => {
          database.close()
          if (this.db === database) {
            this.db = null
            this.connectionPromise = null
          }
        }

        this.db = database
        resolve(database)
      }

      request.onerror = () => {
        rejectAttempt(
          new Error(
            `Database error: ${request.error?.message ?? 'Unable to open IndexedDB'}`,
          ),
        )
      }

      request.onblocked = () => {
        if (settled) {
          return
        }

        console.warn('[DatabaseConnection] IndexedDB upgrade blocked', {
          databaseName: this.dbName,
          databaseVersion: this.dbVersion,
        })
        rejectAttempt(
          new Error(
            'Database upgrade blocked by another open tab. Close other tabs and retry.',
          ),
        )
      }
    })

    return this.connectionPromise
  }

  public async getStore(
    storeName: string,
    mode: IDBTransactionMode = 'readonly',
  ): Promise<IDBObjectStore> {
    const db = await this.connect()
    const transaction = db.transaction(storeName, mode)
    return transaction.objectStore(storeName)
  }
}

export { DatabaseConnection }
