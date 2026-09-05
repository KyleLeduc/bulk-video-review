import { describe, expect, it } from 'vitest'
import {
  prepareTargets,
  validateExtraction,
  safeFailure,
  validateMetrics,
} from './previewExtraction'

describe('custom extraction policy', () => {
  it('requires finite stage evidence and strips arbitrary metric properties', () => {
    const metrics = {
      setupMs: 2,
      extractionMs: 3,
      encodeMs: 4,
      cleanupMs: 1,
      totalMs: 10,
      readMs: 2,
      readMaxMs: 1,
      workerOverheadMs: null,
    }
    expect(validateMetrics({ ...metrics, privatePath: 'secret.mp4' })).toEqual(
      metrics,
    )
    for (const value of [
      undefined,
      { ...metrics, setupMs: -1 },
      { ...metrics, readMs: Infinity },
      { ...metrics, totalMs: '10' },
    ])
      expect(() => validateMetrics(value)).toThrow('output-invalid')
  })
  it('uses the existing nine integer-second DOM targets without upscaling', () => {
    expect(prepareTargets(5, 320, 180)).toEqual({
      targets: [0, 1, 1, 2, 2, 3, 3, 4, 4],
      width: 320,
      height: 180,
    })
    expect(prepareTargets(100, 1920, 1080)).toEqual({
      targets: [10, 20, 30, 40, 50, 60, 70, 80, 90],
      width: 480,
      height: 270,
    })
  })
  it('rejects invalid metadata and excessive decoded dimensions', () => {
    for (const duration of [0, Infinity, NaN])
      expect(() => prepareTargets(duration, 100, 100)).toThrow()
    expect(() => prepareTargets(30, 100000, 100000)).toThrow()
  })
  it('validates output count, type, dimensions and bytes before displaying', () => {
    const prepared = prepareTargets(100, 1920, 1080)
    const result = {
      frames: Array.from(
        { length: 9 },
        () => new Blob(['jpeg'], { type: 'image/jpeg' }),
      ),
      width: 480,
      height: 270,
      readBytes: 4,
      readCalls: 1,
    }
    expect(validateExtraction(result, prepared)).toEqual(result)
    expect(() =>
      validateExtraction({ ...result, frames: [] }, prepared),
    ).toThrow()
    expect(() =>
      validateExtraction({ ...result, width: 481 }, prepared),
    ).toThrow()
    expect(() =>
      validateExtraction({ ...result, readBytes: Infinity }, prepared),
    ).toThrow()
    expect(() =>
      validateExtraction(
        { ...result, frames: Array(9).fill(new Blob(['secret'])) },
        prepared,
      ),
    ).toThrow()
  })
  it('never exports arbitrary error messages', () => {
    expect(safeFailure(new Error('/private/video.mp4'))).toBe(
      'extraction-failed',
    )
    expect(safeFailure(new DOMException('private', 'AbortError'))).toBe(
      'aborted',
    )
  })
})
