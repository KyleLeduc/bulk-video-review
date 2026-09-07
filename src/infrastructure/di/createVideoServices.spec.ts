import { describe, expect, test, vi } from 'vitest'
import { DatabaseConnection } from '../database/DatabaseConnection'
import { createVideoServices } from './createVideoServices'
import {
  UpdateVideoPreviewsUseCase,
  UpdateVideoThumbnailsUseCase,
} from '@app/usecases'

describe('video service composition', () => {
  test('defaults to motion products and retains an explicit cache-free legacy pipeline', () => {
    const connection = DatabaseConnection.forBenchmark(
      '12345678-1234-4123-8123-123456789abc',
    )
    const normal = createVideoServices({ databaseConnection: connection })
    expect(normal.updatePreviewsUseCase).toBeInstanceOf(
      UpdateVideoPreviewsUseCase,
    )
    expect(normal.updateThumbUseCase).toBeNull()
    const legacy = createVideoServices({
      databaseConnection: connection,
      previewMode: 'legacy-stills',
    })
    expect(legacy.updatePreviewsUseCase).toBeNull()
    expect(legacy.updateThumbUseCase).toBeInstanceOf(
      UpdateVideoThumbnailsUseCase,
    )
  })
  test('uses the supplied connection without acquiring or opening the production singleton', () => {
    const singleton = vi.spyOn(DatabaseConnection, 'getInstance')
    try {
      const connection = DatabaseConnection.forBenchmark(
        '12345678-1234-4123-8123-123456789abc',
      )
      const connect = vi.spyOn(connection, 'connect')
      const first = createVideoServices({ databaseConnection: connection })
      const second = createVideoServices({ databaseConnection: connection })
      expect(Object.keys(first).sort()).toEqual(
        [
          'logger',
          'eventPublisher',
          'videoSessionRegistry',
          'videoQueryAdapter',
          'addVideosUseCase',
          'updateThumbUseCase',
          'updatePreviewsUseCase',
          'updateVotesUseCase',
          'wipeVideoDataUseCase',
          'filterVideosUseCase',
          'inspectFailedFiles',
          'libraryBackup',
        ].sort(),
      )
      for (const key of Object.keys(first).filter(
        (key) => first[key as keyof typeof first] !== null,
      ))
        expect(first[key as keyof typeof first]).not.toBe(
          second[key as keyof typeof second],
        )
      expect(singleton).not.toHaveBeenCalled()
      expect(connect).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
