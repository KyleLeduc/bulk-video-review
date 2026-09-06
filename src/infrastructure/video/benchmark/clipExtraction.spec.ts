import { describe, expect, it } from 'vitest'
import {
  clipWindows,
  clipDimensions,
  boundedClipBuffer,
  validateClipOutput,
} from './clipExtraction'

describe('three-second clip policy and output boundary', () => {
  it('spreads ten full clips across long videos without duplicate clamped windows', () => {
    const windows = clipWindows(100)
    expect(windows).toHaveLength(10)
    expect(windows[0]).toEqual({ start: 0, end: 3 })
    expect(windows[9]).toEqual({ start: 90, end: 93 })
    expect(clipWindows(30)[9]).toEqual({ start: 27, end: 30 })
  })
  it('uses fewer non-overlapping windows for short media', () => {
    expect(clipWindows(2)).toEqual([{ start: 0, end: 2 }])
    expect(clipWindows(3)).toEqual([{ start: 0, end: 3 }])
    expect(clipWindows(8)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
  })
  it.each([0, -1, Infinity, NaN])('rejects invalid duration %s', (duration) => {
    expect(() => clipWindows(duration)).toThrow('invalid-metadata')
  })
  it('bounds landscape and portrait dimensions with even encoder sizes', () => {
    expect(clipDimensions(1920, 1080)).toEqual({ width: 320, height: 180 })
    expect(clipDimensions(1080, 1920)).toEqual({ width: 180, height: 320 })
    expect(clipDimensions(161, 91)).toEqual({ width: 160, height: 90 })
  })
  it('handles muxer backpatches but rejects writes beyond the byte ceiling before copying', async () => {
    const buffer = boundedClipBuffer(8)
    buffer.write({ position: 0, data: new Uint8Array([1, 2, 3]) })
    buffer.write({ position: 1, data: new Uint8Array([4]) })
    expect(() =>
      buffer.write({ position: 7, data: new Uint8Array(2) }),
    ).toThrow('output-invalid')
    expect(() =>
      buffer.write({ position: -1, data: new Uint8Array(1) }),
    ).toThrow('output-invalid')
    expect(
      Array.from(new Uint8Array(await buffer.blob('video/mp4').arrayBuffer())),
    ).toEqual([1, 4, 3])
  })
  it('rejects empty or malformed worker output', () => {
    expect(() => validateClipOutput({ clips: [] })).toThrow('output-invalid')
    expect(() => validateClipOutput(undefined)).toThrow('output-invalid')
  })
  it('accepts sub-microsecond boundary rounding but rejects genuinely oversized clips', () => {
    const output = {
      clips: clipWindows(33.3).map((window) => ({
        start: window.start,
        duration: window.end - window.start,
        blob: new Blob(['mp4'], { type: 'video/mp4' }),
      })),
      width: 320,
      height: 180,
      codec: 'avc',
      readBytes: 10,
      readCalls: 1,
      metrics: {
        setupMs: 0,
        conversionMs: 1,
        firstClipMs: 1,
        totalMs: 2,
        readMs: 1,
        readMaxMs: 1,
      },
    }
    expect(() => validateClipOutput(output)).not.toThrow()
    output.clips[0].duration = 3.01
    expect(() => validateClipOutput(output)).toThrow('output-invalid')
  })
})
