import { describe, expect, test, vi } from 'vitest'
import {
  measureVideoProcessing,
  measureVideoProcessingSync,
} from './videoProcessingTiming'

describe('video processing timing observers', () => {
  test.each([false, true])(
    'observer failure preserves operation result or original error (failure=%s)',
    async (fails) => {
      const original = new Error('operation failed')
      const diagnostic = new Error('observer failed')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onTiming = () => {
        throw diagnostic
      }
      try {
        const result = measureVideoProcessing(
          'encode',
          async () => {
            if (fails) throw original
            return 42
          },
          onTiming,
        )
        if (fails) await expect(result).rejects.toBe(original)
        else await expect(result).resolves.toBe(42)

        const runSync = () =>
          measureVideoProcessingSync(
            'capture',
            () => {
              if (fails) throw original
              return 42
            },
            onTiming,
          )
        if (fails) expect(runSync).toThrow(original)
        else expect(runSync()).toBe(42)
        expect(warn).toHaveBeenCalledTimes(2)
        expect(warn).toHaveBeenCalledWith(
          '[video-processing] Timing observer failed',
          diagnostic,
        )
      } finally {
        warn.mockRestore()
      }
    },
  )
})
