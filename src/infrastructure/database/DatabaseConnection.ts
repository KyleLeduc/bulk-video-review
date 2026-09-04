import { handleMigrations } from './migrations'

class DatabaseConnection {
  private static instance: DatabaseConnection
  private dbName = 'VideoMetaDataDB'
  private dbVersion = 4
  private db: IDBDatabase | null = null
  private connectionPromise: Promise<IDBDatabase> | null = null
  private activeConnectionAttempt: symbol | null = null

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection()
    }
    return DatabaseConnection.instance
  }

  public async connect(): Promise<IDBDatabase> {
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

      request.onupgradeneeded = (event) => {
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
