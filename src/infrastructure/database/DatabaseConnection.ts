import { handleMigrations } from './migrations'

class DatabaseConnection {
  private static instance: DatabaseConnection
  private dbName = 'VideoMetaDataDB'
  private dbVersion = 2
  private db: IDBDatabase | null = null

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

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onupgradeneeded = (event) => {
        handleMigrations(request, event.oldVersion)
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve(this.db)
      }

      request.onerror = (event) => {
        reject(
          `Database error: ${(event.target as IDBOpenDBRequest).error?.message}`,
        )
      }
    })
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
