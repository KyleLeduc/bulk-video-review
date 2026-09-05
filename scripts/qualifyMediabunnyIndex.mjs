/* eslint-env node, es2021 */
// Pinned-source qualification probe; not an application adapter or playable-video fixture.
// Fixed small synthetic inputs only. See docs/testing/mediabunny-qualification.md.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.argv.length,
  3,
  'Pass the verified, extracted Mediabunny package directory',
)
const packageDirectory = resolve(process.argv[2])
const manifest = JSON.parse(
  await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
)
assert.equal(manifest.name, 'mediabunny')
assert.equal(manifest.version, '1.55.7')
const { CustomSource, Input, MP4, EncodedPacketSink } = await import(
  pathToFileURL(resolve(packageDirectory, 'dist/modules/src/index.js')).href
)

class SliceOnlyFile extends File {
  arrayBuffer() {
    throw new Error('Top-level file reads are forbidden in this probe')
  }
}

const u32 = (...values) => {
  const bytes = Buffer.alloc(values.length * 4)
  values.forEach((value, i) => bytes.writeUInt32BE(value, i * 4))
  return bytes
}
const box = (name, ...parts) => {
  const data = Buffer.concat(parts)
  return Buffer.concat([u32(data.length + 8), Buffer.from(name), data])
}

function fixture(count, compositionOffsets) {
  assert([1, 4096].includes(count))
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0), Buffer.from('isomavc1'))
  const tkhd = Buffer.alloc(84)
  tkhd.writeUInt32BE(3, 0)
  tkhd.writeUInt32BE(1, 12)
  tkhd.writeUInt32BE(count, 20)
  tkhd.writeUInt32BE(0x10000, 40)
  tkhd.writeUInt32BE(0x10000, 56)
  tkhd.writeUInt32BE(0x40000000, 72)
  tkhd.writeUInt32BE(16 * 0x10000, 76)
  tkhd.writeUInt32BE(16 * 0x10000, 80)
  const mdhd = Buffer.concat([u32(0, 0, 0, 30, count), Buffer.alloc(4)])
  const hdlr = Buffer.concat([u32(0, 0), Buffer.from('vide'), Buffer.alloc(13)])
  const avc1 = Buffer.alloc(78)
  avc1.writeUInt16BE(1, 6)
  avc1.writeUInt16BE(16, 24)
  avc1.writeUInt16BE(16, 26)
  avc1.writeUInt16BE(1, 40)
  avc1.writeUInt16BE(24, 74)
  avc1.writeUInt16BE(65535, 76)
  const moov = (offset) =>
    box(
      'moov',
      box('mvhd', u32(0, 0, 0, 30, count)),
      box(
        'trak',
        box('tkhd', tkhd),
        box(
          'mdia',
          box('mdhd', mdhd),
          box('hdlr', hdlr),
          box(
            'minf',
            box(
              'stbl',
              box('stsd', u32(0, 1), box('avc1', avc1)),
              box('stts', u32(0, 1, count, 1)),
              ...(compositionOffsets ? [box('ctts', u32(0, 1, count, 1))] : []),
              box('stsz', u32(0, 1, count)),
              box('stsc', u32(0, 1, 1, count, 1)),
              box('stco', u32(0, 1, offset)),
            ),
          ),
        ),
      ),
    )
  // Fixed size even when the metadata count changes. Payload is not valid H.264;
  // only metadataOnly retrieval is exercised, never a decoder or media upload.
  const movie = moov(ftyp.length + moov(0).length + 8)
  return new SliceOnlyFile(
    [ftyp, movie, box('mdat', Buffer.alloc(4096))],
    'synthetic.mp4',
  )
}

for (const [count, compositionOffsets] of [
  [1, true],
  [4096, true],
  [4096, false],
]) {
  const file = fixture(count, compositionOffsets)
  const evidence = {
    declaredSamples: count,
    compositionOffsets,
    fixtureBytes: file.size,
    reads: 0,
    readBytes: 0,
    maxReadBytes: 0,
    disposed: false,
  }
  const input = new Input({
    formats: [MP4],
    source: new CustomSource({
      getSize: () => file.size,
      maxCacheSize: 8 * 1024 * 1024,
      prefetchProfile: 'none',
      read: async (start, end) => {
        assert(Number.isSafeInteger(start) && Number.isSafeInteger(end))
        assert(start >= 0 && end > start && end <= file.size)
        assert(end - start <= 1024 * 1024)
        assert(evidence.readBytes + end - start <= 128 * 1024 * 1024)
        evidence.reads++
        evidence.readBytes += end - start
        evidence.maxReadBytes = Math.max(evidence.maxReadBytes, end - start)
        return new Uint8Array(await file.slice(start, end).arrayBuffer())
      },
      dispose: () => {
        evidence.disposed = true
      },
    }),
  })
  try {
    const [track] = await input.getVideoTracks()
    assert(track)
    assert.equal(await track.getCodec(), 'avc')
    // Observe pinned internals for this audit only, never mutate or use as an adapter API.
    assert.equal(track._backing.internalTrack.sampleTable, null)
    const bytesBeforePacket = evidence.readBytes
    const packet = await new EncodedPacketSink(track).getPacket(1 / 30, {
      metadataOnly: true,
    })
    assert(packet)
    const table = track._backing.internalTrack.sampleTable
    evidence.packetReadBytes = evidence.readBytes - bytesBeforePacket
    evidence.timingEntries = table.sampleTimingEntries.length
    evidence.compositionEntries = table.sampleCompositionTimeOffsets.length
    evidence.presentationEntries = table.presentationTimestamps?.length ?? 0
    evidence.presentationIndexEntries =
      table.presentationTimestampIndexMap?.length ?? 0
    assert.equal(evidence.timingEntries, 1)
    assert.equal(evidence.presentationEntries, compositionOffsets ? count : 0)
    assert.equal(
      evidence.presentationIndexEntries,
      compositionOffsets ? count : 0,
    )
    assert.equal(evidence.packetReadBytes, 0)
  } finally {
    input.dispose()
  }
  assert(evidence.disposed)
  console.log(JSON.stringify(evidence))
}

// Observe whether the proposed read callback guard runs before library allocation.
// Use a deliberately tiny 64-byte diagnostic limit, never a large/OOM allocation.
const file = fixture(1, true)
const allocationEvidence = {
  diagnosticReadLimit: 64,
  rejectedReadBytes: 0,
  largestAllocationBeforeRejection: 0,
  disposed: false,
}
const originalUint8Array = globalThis.Uint8Array
let largestNumericAllocation = 0
const input = new Input({
  formats: [MP4],
  source: new CustomSource({
    getSize: () => file.size,
    maxCacheSize: 8 * 1024 * 1024,
    prefetchProfile: 'none',
    read: async (start, end) => {
      if (end - start > allocationEvidence.diagnosticReadLimit) {
        allocationEvidence.rejectedReadBytes = end - start
        allocationEvidence.largestAllocationBeforeRejection =
          largestNumericAllocation
        throw new RangeError('probe-read-limit')
      }
      return new originalUint8Array(await file.slice(start, end).arrayBuffer())
    },
    dispose: () => {
      allocationEvidence.disposed = true
    },
  }),
})
try {
  // Pass through unchanged construction; observe only in this standalone process.
  globalThis.Uint8Array = new Proxy(originalUint8Array, {
    construct(target, args) {
      const bytes = Reflect.construct(target, args)
      if (typeof args[0] === 'number')
        largestNumericAllocation = Math.max(
          largestNumericAllocation,
          bytes.byteLength,
        )
      return bytes
    },
  })
  await assert.rejects(input.getVideoTracks(), /probe-read-limit/)
} finally {
  globalThis.Uint8Array = originalUint8Array
  input.dispose()
}
assert(allocationEvidence.disposed)
assert(
  allocationEvidence.rejectedReadBytes > allocationEvidence.diagnosticReadLimit,
)
assert(
  allocationEvidence.largestAllocationBeforeRejection >=
    allocationEvidence.rejectedReadBytes,
)
console.log(JSON.stringify(allocationEvidence))
