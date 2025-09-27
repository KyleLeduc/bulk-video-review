/**
 * Handles casting store.getAll return type and promise resolution
 *
 * @param store The IDBObjectStore to access
 * @returns promise array of all found data from the provided store
 */
export const getAllFromStore = <T>(store: IDBObjectStore): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result as T[])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Used to verify the transaction completed successfully at the end of an operation
 *
 * @param transaction
 * @returns resolves on success, rejects on error or abort
 */
export const transactionComplete = (
  transaction: IDBTransaction,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(transaction.error)
    }

    transaction.onabort = () => {
      reject(transaction.error)
    }
  })
}
