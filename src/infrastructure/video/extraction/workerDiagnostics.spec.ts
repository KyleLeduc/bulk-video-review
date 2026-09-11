import { expect, it } from 'vitest'
import { safeDiagnostics } from './workerDiagnostics'

it('retains only bounded vocabulary and finite numeric timeline evidence', () => {
  expect(
    safeDiagnostics({
      stage: 'timeline',
      codec: 'avc',
      errorName: 'Error',
      timelineReason: 'track-ends-before-player',
      timeResolution: 30000,
      trackStart: -0.03,
      trackEnd: 59.97,
      storedDuration: 60,
      readBytes: 42,
      readCalls: 2,
      filename: 'private.mp4',
      path: 'private/folder',
      message: 'private library error',
      stack: 'private stack',
    }),
  ).toEqual({
    stage: 'timeline',
    codec: 'avc',
    errorName: 'Error',
    timelineReason: 'track-ends-before-player',
    timeResolution: 30000,
    trackStart: -0.03,
    trackEnd: 59.97,
    storedDuration: 60,
    readBytes: 42,
    readCalls: 2,
  })
  expect(
    safeDiagnostics({
      timelineReason: 'private warning',
      timeResolution: Infinity,
      elapsedMs: -1,
      trackEnd: NaN,
      readBytes: '42',
    }),
  ).toEqual({})
  expect(
    safeDiagnostics({
      codec: { toString: () => 'avc', path: 'private' },
      errorName: { toString: () => 'Error' },
      stage: { toString: () => 'timeline' },
    }),
  ).toEqual({})
})
