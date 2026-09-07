import type { BUILD_IDENTITY } from '@/shared/buildIdentity'

export const LIBRARY_STORES = [
  'videoCacheDto',
  'VideoMetadata',
  'VideoIngestionFailures',
  'VideoPreviewFrames',
] as const
export type LibrarySnapshot = {
  version: number
  libraryVersion: number
  cacheVersion: number
  createdAt: string
  build: typeof BUILD_IDENTITY
  library: Record<(typeof LIBRARY_STORES)[number], unknown[]>
  cache: unknown[]
}
const MAGIC = new TextEncoder().encode('BVR-FULL-1\n')
const PREFIX = MAGIC.length + 4 + 32
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
function fail(message = 'Invalid backup record'): never {
  throw new Error(message)
}
const object = (value: unknown): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail()
  return value as Record<string, unknown>
}
const fields = (value: unknown, names: string[]) => {
  const record = object(value)
  if (
    Object.keys(record).some((key) => !names.includes(key)) ||
    names.some((key) => !(key in record))
  )
    fail()
  return record
}
const string = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_MANIFEST_BYTES
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 100000) return fail()
  return value
}
const image = (value: unknown) =>
  string(value) &&
  (value === '' ||
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]*$/.test(value))
function frame(value: unknown, clip = false) {
  const row = fields(value, [
    'timestampSeconds',
    'width',
    'height',
    'blob',
    ...(clip ? ['durationSeconds'] : []),
  ])
  if (
    !number(row.timestampSeconds) ||
    !['width', 'height'].every(
      (key) =>
        Number.isInteger(row[key]) &&
        Number(row[key]) > 0 &&
        Number(row[key]) <= 8192,
    ) ||
    (clip && !number(row.durationSeconds))
  )
    fail()
  if (
    !(row.blob instanceof Blob) ||
    (typeof File !== 'undefined' && row.blob instanceof File) ||
    row.blob.size === 0 ||
    row.blob.size > 16 * 1024 * 1024 ||
    !(
      clip
        ? ['video/mp4', 'video/webm']
        : ['image/jpeg', 'image/png', 'image/webp']
    ).includes(row.blob.type)
  )
    fail()
}

/** Validate before either database is touched; intentionally supports only this exact schema. */
export function validateLibrarySnapshot(
  value: unknown,
): asserts value is LibrarySnapshot {
  const snapshot = fields(value, [
    'version',
    'libraryVersion',
    'cacheVersion',
    'createdAt',
    'build',
    'library',
    'cache',
  ])
  if (
    snapshot.version !== 1 ||
    snapshot.libraryVersion !== 4 ||
    snapshot.cacheVersion !== 1
  )
    fail('Unsupported backup schema')
  if (
    !string(snapshot.createdAt) ||
    !Number.isFinite(Date.parse(snapshot.createdAt))
  )
    fail()
  const build = fields(snapshot.build, ['revision', 'dirty', 'source'])
  if (
    (build.revision !== null &&
      !(string(build.revision) && /^[a-f0-9]{40}$/.test(build.revision))) ||
    ![true, false, null].includes(build.dirty as boolean | null) ||
    !string(build.source) ||
    build.source.length > 100
  )
    fail()
  const library = fields(snapshot.library, [...LIBRARY_STORES])
  for (const name of LIBRARY_STORES) {
    const seen = new Set<string>()
    for (const value of list(library[name])) {
      const row = object(value)
      const id = row[name === 'VideoPreviewFrames' ? 'videoId' : 'id']
      if (!string(id) || !id || id.length > 10000) fail()
      if (seen.has(id)) fail('Duplicate backup key')
      seen.add(id)
      if (name === 'videoCacheDto') {
        fields(row, ['id', 'title', 'duration', 'tags', 'thumb', 'thumbUrls'])
        if (
          !string(row.title) ||
          !number(row.duration) ||
          !image(row.thumb) ||
          !list(row.tags).every(string) ||
          !list(row.thumbUrls).every(image)
        )
          fail()
      } else if (name === 'VideoMetadata') {
        fields(row, ['id', 'votes'])
        if (!Number.isSafeInteger(row.votes)) fail()
      } else if (name === 'VideoIngestionFailures') {
        fields(row, ['id', 'failureCount', 'lastFailureAt'])
        if (
          !Number.isSafeInteger(row.failureCount) ||
          Number(row.failureCount) < 0 ||
          !string(row.lastFailureAt) ||
          !Number.isFinite(Date.parse(row.lastFailureAt))
        )
          fail()
      } else {
        fields(row, ['videoId', 'frames'])
        for (const item of list(row.frames)) frame(item)
      }
    }
  }
  const seen = new Set<string>()
  let cacheBytes = 0
  for (const value of list(snapshot.cache)) {
    const row = fields(value, [
      'key',
      'duration',
      'lastUsed',
      'bytes',
      'product',
    ])
    if (
      !string(row.key) ||
      !number(row.duration) ||
      !number(row.lastUsed) ||
      !Number.isSafeInteger(row.bytes) ||
      Number(row.bytes) < 0
    )
      fail()
    if (seen.has(row.key)) fail('Duplicate backup key')
    seen.add(row.key)
    const product = object(row.product)
    const fallback = product.kind === 'motionFallback'
    fields(product, [
      'kind',
      'version',
      'items',
      ...(fallback ? ['reason'] : []),
    ])
    if (
      !['motionClips', 'keyframes', 'motionFallback'].includes(
        String(product.kind),
      ) ||
      !string(product.version) ||
      !product.version ||
      (fallback && !string(product.reason))
    )
      fail()
    let key: unknown
    try {
      key = JSON.parse(row.key)
    } catch {
      fail()
    }
    if (
      !Array.isArray(key) ||
      key.length !== 3 ||
      !string(key[0]) ||
      !key[0] ||
      key[1] !== product.kind ||
      key[2] !== product.version
    )
      fail()
    let bytes = 0
    for (const item of list(product.items)) {
      frame(item, product.kind === 'motionClips')
      bytes += (item as { blob: Blob }).blob.size
    }
    if (bytes !== row.bytes) fail()
    cacheBytes += bytes
  }
  if (cacheBytes > 256 * 1024 * 1024)
    fail('Preview cache exceeds supported capacity')
}

const digest = async (bytes: ArrayBuffer) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
const hex = (bytes: Uint8Array) =>
  [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('')

export async function encodeLibraryArchive(
  snapshot: LibrarySnapshot,
): Promise<Blob> {
  validateLibrarySnapshot(snapshot)
  const blobs: Blob[] = []
  const encode = (value: unknown): unknown => {
    if (value instanceof Blob) {
      if (blobs.length >= 100000) fail('Backup exceeds 100000 binary records')
      blobs.push(value)
      return { $bvrBlob: blobs.length - 1 }
    }
    if (Array.isArray(value)) return value.map(encode)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, encode(item)]),
      )
    return value
  }
  const encoded = encode(snapshot)
  const binary = []
  for (const blob of blobs)
    binary.push({
      size: blob.size,
      type: blob.type,
      sha256: hex(await digest(await blob.arrayBuffer())),
    })
  const manifest = new TextEncoder().encode(
    JSON.stringify({ snapshot: encoded, blobs: binary }),
  )
  if (manifest.length > MAX_MANIFEST_BYTES)
    fail('Backup manifest exceeds 64 MiB limit')
  const prefix = new Uint8Array(PREFIX)
  prefix.set(MAGIC)
  new DataView(prefix.buffer).setUint32(MAGIC.length, manifest.length)
  prefix.set(await digest(manifest.buffer), MAGIC.length + 4)
  const archive = new Blob([prefix, manifest, ...blobs], {
    type: 'application/octet-stream',
  })
  if (archive.size > MAX_ARCHIVE_BYTES) fail('Backup exceeds 1 GiB limit')
  return archive
}

export async function decodeLibraryArchive(
  archive: Blob,
): Promise<LibrarySnapshot> {
  if (archive.size < PREFIX || archive.size > MAX_ARCHIVE_BYTES)
    fail('Invalid backup size')
  const prefix = new Uint8Array(await archive.slice(0, PREFIX).arrayBuffer())
  if (!MAGIC.every((n, i) => prefix[i] === n)) fail('Unsupported backup format')
  const length = new DataView(prefix.buffer).getUint32(MAGIC.length)
  if (
    length === 0 ||
    length > MAX_MANIFEST_BYTES ||
    PREFIX + length > archive.size
  )
    fail('Invalid backup manifest size')
  const bytes = await archive.slice(PREFIX, PREFIX + length).arrayBuffer()
  if (hex(await digest(bytes)) !== hex(prefix.subarray(MAGIC.length + 4)))
    fail('Backup manifest checksum failed')
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    fail('Invalid backup JSON')
  }
  const manifest = fields(parsed, ['snapshot', 'blobs'])
  let offset = PREFIX + length
  const blobs: Blob[] = []
  for (const value of list(manifest.blobs)) {
    const entry = fields(value, ['size', 'type', 'sha256'])
    if (
      !Number.isSafeInteger(entry.size) ||
      Number(entry.size) <= 0 ||
      Number(entry.size) > 16 * 1024 * 1024 ||
      !string(entry.type) ||
      !string(entry.sha256) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      offset + Number(entry.size) > archive.size
    )
      fail('Invalid backup binary reference')
    const blob = archive.slice(
      offset,
      offset + Number(entry.size),
      entry.type as string,
    )
    if (hex(await digest(await blob.arrayBuffer())) !== entry.sha256)
      fail('Backup payload checksum failed')
    blobs.push(blob)
    offset += blob.size
  }
  if (offset !== archive.size) fail('Unexpected backup trailing bytes')
  const used = new Set<number>()
  const decode = (value: unknown, depth = 0): unknown => {
    if (depth > 24) return fail('Backup nesting limit exceeded')
    if (Array.isArray(value))
      return list(value).map((item) => decode(item, depth + 1))
    if (value && typeof value === 'object') {
      const row = object(value)
      if ('$bvrBlob' in row) {
        const index = row.$bvrBlob
        if (
          Object.keys(row).length !== 1 ||
          !Number.isInteger(index) ||
          Number(index) < 0 ||
          Number(index) >= blobs.length ||
          used.has(Number(index))
        )
          fail('Invalid backup binary reference')
        used.add(Number(index))
        return blobs[Number(index)]
      }
      if (
        Object.keys(row).some((key) =>
          ['__proto__', 'constructor', 'prototype'].includes(key),
        )
      )
        fail()
      return Object.fromEntries(
        Object.entries(row).map(([key, item]) => [
          key,
          decode(item, depth + 1),
        ]),
      )
    }
    return value
  }
  const snapshot = decode(manifest.snapshot)
  if (used.size !== blobs.length) fail('Unreferenced backup payload')
  validateLibrarySnapshot(snapshot)
  return snapshot
}
