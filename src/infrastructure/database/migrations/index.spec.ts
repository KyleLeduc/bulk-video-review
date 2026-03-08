import { beforeEach, describe, expect, test, vi } from 'vitest'
import { handleMigrations } from './index'
import { handleParsedVideoMigration } from './v1'
import { handleAddVideoMetadataStore } from './v2'
import { handleAddVideoIngestionFailuresStore } from './v3'

vi.mock('./v1', () => ({
  handleParsedVideoMigration: vi.fn(),
}))

vi.mock('./v2', () => ({
  handleAddVideoMetadataStore: vi.fn(),
}))

vi.mock('./v3', () => ({
  handleAddVideoIngestionFailuresStore: vi.fn(),
}))

const createRequest = () =>
  ({
    result: {
      objectStoreNames: {
        contains: vi.fn(() => false),
      },
      createObjectStore: vi.fn(),
    },
  }) as unknown as IDBOpenDBRequest

describe('handleMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('runs only the v3 migration when upgrading from database version 2', () => {
    const request = createRequest()

    handleMigrations(request, 2)

    expect(handleParsedVideoMigration).not.toHaveBeenCalled()
    expect(handleAddVideoMetadataStore).not.toHaveBeenCalled()
    expect(handleAddVideoIngestionFailuresStore).toHaveBeenCalledWith(request)
  })
})
