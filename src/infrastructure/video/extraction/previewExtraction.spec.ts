import { describe, expect, it } from 'vitest'
import {
  prepareTargets,
  validateExtraction,
  safeFailure,
  validateMetrics,
  readBudgetForCount,
} from './previewExtraction'

describe('custom extraction policy', () => {
  it('prepares 100 evenly spaced fractional targets without rounding short videos', () => {
    const prepared = prepareTargets(5, 320, 180, 100)
    expect(prepared.targets).toHaveLength(100)
    expect(new Set(prepared.targets).size).toBe(100)
    expect(prepared.targets[0]).toBeCloseTo(5 / 101)
    expect(prepared.targets[99]).toBeCloseTo(500 / 101)
    expect(prepared.width).toBe(320)
    for (const count of [0, 10, 99, 101, Infinity, NaN]) {
      expect(() => prepareTargets(5, 320, 180, count as never)).toThrow()
      expect(() => readBudgetForCount(count)).toThrow()
    }
    expect(readBudgetForCount(9)).toBe(256 * 1024 * 1024)
    expect(readBudgetForCount(100)).toBe(1024 * 1024 * 1024)
  })
  it('validates dense count and its bounded read budget without relaxing output limits', () => {
    const prepared = prepareTargets(100, 320, 180, 100)
    const result = {
      frames: Array(100).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
      width: 320,
      height: 180,
      readBytes: 1024 * 1024 * 1024,
      readCalls: 100,
    }
    expect(validateExtraction(result, prepared)).toEqual(result)
    expect(() =>
      validateExtraction(
        { ...result, frames: result.frames.slice(1) },
        prepared,
      ),
    ).toThrow()
    expect(() =>
      validateExtraction(
        { ...result, readBytes: result.readBytes + 1 },
        prepared,
      ),
    ).toThrow()
    expect(() =>
      validateExtraction(result, prepareTargets(100, 320, 180)),
    ).toThrow()
    const large = new Blob([new Uint8Array(200000)], { type: 'image/jpeg' })
    expect(() =>
      validateExtraction(
        { ...result, frames: Array(100).fill(large) },
        prepared,
      ),
    ).toThrow()
  })
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
