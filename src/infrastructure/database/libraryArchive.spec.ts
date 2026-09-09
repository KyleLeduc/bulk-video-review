// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { LibraryBackup } from './LibraryBackup'
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

it('inspects every archived vote independently of partial clip coverage without opening a database', async () => {
  const value = snapshot()
  const video = value.library.videoCacheDto[0] as Record<string, unknown>
  value.library.videoCacheDto = Array.from({ length: 500 }, (_, i) => ({
    ...video,
    id: `private-id-${i}`,
    title: `private-video-${i}.mp4`,
  }))
  value.library.VideoMetadata = Array.from({ length: 498 }, (_, i) => ({
    id: `private-id-${i}`,
    votes: [5, -5, 0][i % 3],
  }))
  value.library.VideoMetadata.push(
    { id: 'orphan-positive', votes: 9 },
    { id: 'orphan-negative', votes: -9 },
  )
  value.library.VideoPreviewFrames = []
  value.cache = Array.from({ length: 20 }, (_, i) => ({
    key: JSON.stringify([`private-id-${i}`, 'motionClips', 'v1']),
    duration: 60,
    lastUsed: 1,
    bytes: 4,
    product: {
      kind: 'motionClips',
      version: 'v1',
      items: [
        {
          timestampSeconds: 0,
          durationSeconds: 1.5,
          width: 320,
          height: 180,
          blob: new Blob(['clip'], { type: 'video/mp4' }),
        },
      ],
    },
  }))
  const archive = await encodeLibraryArchive(value)
  const originalBytes = await archive.arrayBuffer()
  const connect = vi.fn(async () => {
    throw new Error(
      'Read-only archive inspection must not connect to a database',
    )
  })
  const summary = await new LibraryBackup(connect, connect).inspectArchive(
    archive,
  )
  expect(summary.votes).toEqual({
    positive: 167,
    negative: 167,
    zero: 166,
    nonzero: 334,
    missingMetadata: 2,
    orphanMetadata: 2,
  })
  expect(summary.counts).toMatchObject({
    videoCacheDto: 500,
    VideoMetadata: 500,
    previewProducts: 20,
  })
  expect(connect).not.toHaveBeenCalled()
  expect(await archive.arrayBuffer()).toEqual(originalBytes)
  expect((await decodeLibraryArchive(archive)).library.VideoMetadata).toEqual(
    value.library.VideoMetadata,
  )
  expect(JSON.stringify(summary)).not.toMatch(/private-|orphan-|base64|雪/)
})

it.each([[], [{ id: 'a', votes: 0 }]])(
  'distinguishes absent metadata from a saved zero without normalizing either',
  async (...metadata) => {
    const value = snapshot()
    value.library.VideoMetadata = metadata
    const archive = await encodeLibraryArchive(value)
    const connect = vi.fn(async () => {
      throw new Error('Unexpected database access')
    })
    const summary = await new LibraryBackup(connect, connect).inspectArchive(
      archive,
    )
    expect(summary.votes).toEqual({
      positive: 0,
      negative: 0,
      zero: metadata.length,
      nonzero: 0,
      missingMetadata: 1 - metadata.length,
      orphanMetadata: 0,
    })
    expect(connect).not.toHaveBeenCalled()
  },
)

it('rejects damaged vote inspection without database access or a partial summary', async () => {
  const archive = await encodeLibraryArchive(snapshot())
  const bytes = new Uint8Array(await archive.arrayBuffer())
  bytes[bytes.length - 1] ^= 1
  const connect = vi.fn(async () => {
    throw new Error('Unexpected database access')
  })
  await expect(
    new LibraryBackup(connect, connect).inspectArchive(new Blob([bytes])),
  ).rejects.toThrow(/checksum/i)
  expect(connect).not.toHaveBeenCalled()
})

it('keeps untrusted free-text identity fields out of copyable inspection evidence', async () => {
  const value = snapshot()
  value.build.source = 'private-folder/video.mp4'
  value.createdAt = '2026-09-07 (private-folder/video.mp4)'
  const archive = await encodeLibraryArchive(value)
  const connect = vi.fn(async () => {
    throw new Error('Unexpected database access')
  })
  const summary = await new LibraryBackup(connect, connect).inspectArchive(
    archive,
  )
  expect(summary.build.source).toBe('unknown')
  expect(summary.createdAt).toBe(new Date(value.createdAt).toISOString())
  expect(JSON.stringify(summary)).not.toContain('private-folder')
  expect(connect).not.toHaveBeenCalled()
})
