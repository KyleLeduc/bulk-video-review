import { expect, it } from 'vitest'
import { prepareKeyframes, validateKeyframeOutput } from './keyframeExtraction'
import { emptyMetrics } from './previewExtraction'
it('derives aspect-preserving small targets without changing the legacy 9/100 contract', () => {
  expect(prepareKeyframes(60, 1920, 1080)).toEqual({
    targets: [0, 15, 30, 45],
    width: 160,
    height: 90,
  })
  expect(prepareKeyframes(1, 80, 120)).toEqual({
    targets: [0],
    width: 80,
    height: 120,
  })
  expect(prepareKeyframes(3000, 1920, 1080, 120).targets).toHaveLength(100)
  for (const width of [0, 480, NaN])
    expect(() => prepareKeyframes(60, 1920, 1080, width)).toThrow()
  expect(() => prepareKeyframes(0, 1920, 1080)).toThrow()
})
it('rejects partial, oversized or malformed keyframe replies', () => {
  const output = {
    frames: [new Blob(['jpeg'], { type: 'image/jpeg' })],
    width: 160,
    height: 90,
    readBytes: 4,
    readCalls: 1,
    metrics: emptyMetrics(),
  }
  expect(validateKeyframeOutput(output, 10, 160)).toEqual(output)
  expect(() => validateKeyframeOutput(output, 60, 160)).toThrow(
    'output-invalid',
  )
  expect(() =>
    validateKeyframeOutput({ ...output, width: 320 }, 10, 160),
  ).toThrow()
  expect(() =>
    validateKeyframeOutput({ ...output, width: 0 }, 10, 160),
  ).toThrow('output-invalid')
  expect(() =>
    validateKeyframeOutput({ ...output, readBytes: 2 ** 31 }, 10, 160),
  ).toThrow()
})
