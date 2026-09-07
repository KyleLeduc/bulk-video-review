// @vitest-environment node
import { expect, it } from 'vitest'
import {
  encodeLibraryArchive,
  decodeLibraryArchive,
  type LibrarySnapshot,
} from './libraryArchive'

const snapshot = (): LibrarySnapshot => ({
  version: 1,
  libraryVersion: 4,
  cacheVersion: 1,
  createdAt: '2026-09-07T00:00:00.000Z',
  build: { revision: null, dirty: null, source: 'unknown' },
  library: {
    videoCacheDto: [
      {
        id: 'a',
        title: '雪.mp4',
        duration: 60,
        tags: ['tag'],
        thumb: 'data:image/jpeg;base64,YQ==',
        thumbUrls: [],
      },
    ],
    VideoMetadata: [{ id: 'a', votes: 5 }],
    VideoIngestionFailures: [
      { id: 'b', failureCount: 2, lastFailureAt: '2026-09-07T00:00:00.000Z' },
    ],
    VideoPreviewFrames: [
      {
        videoId: 'a',
        frames: [
          {
            timestampSeconds: 6,
            width: 160,
            height: 90,
            blob: new Blob(['still'], { type: 'image/jpeg' }),
          },
        ],
      },
    ],
  },
  cache: [
    {
      key: JSON.stringify(['a', 'keyframes', 'v1']),
      duration: 60,
      lastUsed: 1,
      bytes: 4,
      product: {
        kind: 'keyframes',
        version: 'v1',
        items: [
          {
            timestampSeconds: 0,
            width: 160,
            height: 90,
            blob: new Blob(['seek'], { type: 'image/jpeg' }),
          },
        ],
      },
    },
  ],
})

it('round-trips every store and binary payload without original media', async () => {
  const archive = await encodeLibraryArchive(snapshot())
  const restored = await decodeLibraryArchive(archive)
  expect(restored.library.videoCacheDto).toEqual(
    snapshot().library.videoCacheDto,
  )
  expect(restored.library.VideoMetadata).toEqual([{ id: 'a', votes: 5 }])
  expect(restored.library.VideoIngestionFailures).toEqual(
    snapshot().library.VideoIngestionFailures,
  )
  expect(
    await (
      restored.library.VideoPreviewFrames[0] as { frames: { blob: Blob }[] }
    ).frames[0].blob.text(),
  ).toBe('still')
  expect(
    await (
      restored.cache[0] as { product: { items: { blob: Blob }[] } }
    ).product.items[0].blob.text(),
  ).toBe('seek')
})
it('rejects truncated and checksum-damaged archives', async () => {
  const archive = await encodeLibraryArchive(snapshot())
  await expect(
    decodeLibraryArchive(archive.slice(0, archive.size - 1)),
  ).rejects.toThrow()
  const bytes = new Uint8Array(await archive.arrayBuffer())
  bytes[bytes.length - 1] ^= 1
  await expect(decodeLibraryArchive(new Blob([bytes]))).rejects.toThrow(
    /checksum/i,
  )
})
it('rejects aggregate binary counts that the restore format cannot accept', async () => {
  const value = snapshot()
  const frame = {
    timestampSeconds: 0,
    width: 1,
    height: 1,
    blob: new Blob(['x'], { type: 'image/jpeg' }),
  }
  value.library.VideoPreviewFrames = [
    { videoId: 'a', frames: Array(100000).fill(frame) },
  ]
  // The extra cache Blob would exceed the shared decoder list bound.
  await expect(encodeLibraryArchive(value)).rejects.toThrow(/binary records/)
})
it('rejects newer schemas, duplicate keys, executable image URLs and original File payloads', async () => {
  const newer = snapshot()
  newer.libraryVersion = 5
  await expect(encodeLibraryArchive(newer)).rejects.toThrow(/schema/i)
  const duplicate = snapshot()
  duplicate.library.VideoMetadata.push({ id: 'a', votes: 2 })
  await expect(encodeLibraryArchive(duplicate)).rejects.toThrow(/duplicate/i)
  const unsafe = snapshot()
  ;(unsafe.library.videoCacheDto[0] as { thumb: string }).thumb =
    'javascript:alert(1)'
  await expect(encodeLibraryArchive(unsafe)).rejects.toThrow(/record/i)
  const original = snapshot()
  ;(
    original.cache[0] as { product: { items: { blob: Blob }[] } }
  ).product.items[0].blob = new File(['video'], 'original.mp4')
  await expect(encodeLibraryArchive(original)).rejects.toThrow(/record/i)
})
