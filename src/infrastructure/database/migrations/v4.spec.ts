import { describe, expect, test, vi } from 'vitest'
import { storeNames } from '@domain/constants'
import { handleAddVideoPreviewFramesStore } from './v4'

describe('handleAddVideoPreviewFramesStore', () => {
  test('creates a preview frame store keyed by video id', () => {
    const createObjectStore = vi.fn()
    const request = {
      result: {
        objectStoreNames: {
          contains: vi.fn(() => false),
        },
        createObjectStore,
      },
    } as unknown as IDBOpenDBRequest

    handleAddVideoPreviewFramesStore(request)

    expect(createObjectStore).toHaveBeenCalledWith(storeNames.videoPreviews, {
      keyPath: 'videoId',
    })
  })

  test('leaves an existing preview frame store unchanged', () => {
    const createObjectStore = vi.fn()
    const request = {
      result: {
        objectStoreNames: {
          contains: vi.fn(() => true),
        },
        createObjectStore,
      },
    } as unknown as IDBOpenDBRequest

    handleAddVideoPreviewFramesStore(request)

    expect(createObjectStore).not.toHaveBeenCalled()
  })
})
