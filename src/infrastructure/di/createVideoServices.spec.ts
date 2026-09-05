import { describe, expect, test, vi } from 'vitest'
import { DatabaseConnection } from '../database/DatabaseConnection'
import { createVideoServices } from './createVideoServices'

describe('video service composition', () => {
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
          'updateVotesUseCase',
          'wipeVideoDataUseCase',
          'filterVideosUseCase',
        ].sort(),
      )
      for (const key of Object.keys(first))
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
