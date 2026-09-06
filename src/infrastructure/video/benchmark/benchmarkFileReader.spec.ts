// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createBenchmarkFileReader } from './benchmarkFileReader'
import { emptyMetrics, MAX_READ_BYTES } from './previewExtraction'

const block = 1024 * 1024
function fixture(size = 2 * block + 13) {
  const data = new Uint8Array(size)
  for (let i = 0; i < size; i++) data[i] = i % 251
  const file = new Blob([data])
  const slice = vi.spyOn(file, 'slice')
  const metrics = emptyMetrics()
  return { data, file, slice, metrics }
}
it('keeps direct reads exact and counts actual I/O', async () => {
  const { file, slice, metrics, data } = fixture()
  const reader = createBenchmarkFileReader(file, 'direct', metrics)
  expect(await reader.read(10, 30)).toEqual(data.slice(10, 30))
  await reader.read(30, 50)
  expect(slice.mock.calls).toEqual([
    [10, 30],
    [30, 50],
  ])
  expect(reader.readBytes).toBe(40)
  expect(reader.readCalls).toBe(2)
  expect(metrics.readMs).toBeGreaterThanOrEqual(0)
})
it('shares one window for concurrent adjacent reads and returns isolated exact bytes', async () => {
  const { file, slice, metrics, data } = fixture()
  const reader = createBenchmarkFileReader(file, 'buffered-1mib', metrics)
  const [a, b] = await Promise.all([reader.read(10, 30), reader.read(30, 50)])
  expect(a).toEqual(data.slice(10, 30))
  expect(b).toEqual(data.slice(30, 50))
  expect(a.buffer.byteLength).toBe(20)
  a.fill(0)
  expect(await reader.read(10, 30)).toEqual(data.slice(10, 30))
  expect(slice.mock.calls).toEqual([[10, block + 10]])
  expect(reader.readBytes).toBe(block)
  expect(reader.readCalls).toBe(1)
})
it('replaces the window, clamps at EOF and bypasses caching for large requests', async () => {
  const { file, slice, metrics, data } = fixture()
  const reader = createBenchmarkFileReader(file, 'buffered-1mib', metrics)
  await reader.read(0, 10)
  expect(await reader.read(block - 2, block + 2)).toEqual(
    data.slice(block - 2, block + 2),
  )
  expect(await reader.read(2 * block, file.size)).toEqual(data.slice(2 * block))
  // Native byte comparison avoids a million-element assertion traversal under suite load.
  expect(
    Buffer.from(await reader.read(0, block + 1)).equals(
      data.subarray(0, block + 1),
    ),
  ).toBe(true)
  await reader.read(0, 10)
  expect(slice.mock.calls).toEqual([
    [0, block],
    [block - 2, 2 * block - 2],
    [2 * block, file.size],
    [0, block + 1],
    [0, block],
  ])
})
it.each(['direct', 'buffered-1mib'] as const)(
  'rejects invalid ranges before I/O (%s)',
  async (mode) => {
    const { file, slice, metrics } = fixture()
    const reader = createBenchmarkFileReader(file, mode, metrics)
    for (const [start, end] of [
      [-1, 1],
      [0, 0],
      [2, 1],
      [0.5, 1],
      [0, NaN],
      [0, file.size + 1],
    ])
      await expect(reader.read(start, end)).rejects.toThrow('read-limit')
    expect(slice).not.toHaveBeenCalled()
  },
)
it.each(['direct', 'buffered-1mib'] as const)(
  'reserves cumulative actual bytes and rejects oversized reads (%s)',
  async (mode) => {
    // Fake large size without allocating a huge file; failed physical reads still consume budget.
    const file = {
      size: MAX_READ_BYTES + block,
      slice: vi.fn(() => {
        throw new Error('I/O failed')
      }),
    } as unknown as Blob
    const reader = createBenchmarkFileReader(file, mode, emptyMetrics())
    await expect(reader.read(0, 16 * block + 1)).rejects.toThrow('read-limit')
    for (let i = 0; i < 16; i++)
      await expect(reader.read(0, 16 * block)).rejects.toThrow('I/O failed')
    await expect(reader.read(0, 1)).rejects.toThrow('read-limit')
    expect(reader.readBytes).toBe(MAX_READ_BYTES)
    expect(reader.readCalls).toBe(16)
  },
)
it('counts read-ahead toward the limit even when only one byte is requested', async () => {
  const file = {
    size: MAX_READ_BYTES + block,
    slice: vi.fn(() => {
      throw new Error('I/O failed')
    }),
  } as unknown as Blob
  const reader = createBenchmarkFileReader(
    file,
    'buffered-1mib',
    emptyMetrics(),
  )
  for (let i = 0; i < 256; i++)
    await expect(reader.read(0, 1)).rejects.toThrow('I/O failed')
  await expect(reader.read(0, 1)).rejects.toThrow('read-limit')
  expect(reader.readBytes).toBe(MAX_READ_BYTES)
})
it('does not poison subsequent buffered requests after a rejected read', async () => {
  const { file, slice, metrics, data } = fixture()
  slice.mockImplementationOnce(() => {
    throw new Error('I/O failed')
  })
  const reader = createBenchmarkFileReader(file, 'buffered-1mib', metrics)
  await expect(reader.read(0, 10)).rejects.toThrow('I/O failed')
  expect(await reader.read(0, 10)).toEqual(data.slice(0, 10))
  expect(reader.readBytes).toBe(2 * block)
})
