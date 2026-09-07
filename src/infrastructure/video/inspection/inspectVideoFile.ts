import type { FileInspection } from '@app/ports/IVideoFileInspector'

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))
const mp4Types = new Set([
  'ftyp',
  'moov',
  'mdat',
  'free',
  'wide',
  'skip',
  'uuid',
  'styp',
  'moof',
  'sidx',
])
class InspectionLimit extends Error {}

/** Reads headers only. Box boundaries do not certify metadata contents or decoding. */
export async function inspectVideoFile(
  file: File,
  { signal, maxBoxes = 1024 }: { signal: AbortSignal; maxBoxes?: number },
): Promise<FileInspection> {
  signal.throwIfAborted()
  const deadline = performance.now() + 10000
  const boxLimit = Number.isInteger(maxBoxes)
    ? Math.min(Math.max(maxBoxes, 0), 1024)
    : 1024
  const result: FileInspection = {
    container: 'unknown',
    fragmented: false,
    decodeChecked: false,
    coverage: { readBytes: 0, boxes: 0, completeTopLevelScan: false },
    findings: [],
  }
  const finding = (
    severity: 'info' | 'warning' | 'error',
    code: string,
    detail: string,
  ) => result.findings.push({ severity, code, detail })
  const read = async (offset: number, length: number) => {
    signal.throwIfAborted()
    const remaining = deadline - performance.now()
    if (remaining <= 0 || result.coverage.readBytes + length > 256 * 1024)
      throw new InspectionLimit()
    const part = file.slice(offset, offset + length)
    result.coverage.readBytes += part.size
    return new Promise<Uint8Array>((resolve, reject) => {
      const abort = () =>
        finish(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
      const timer = setTimeout(() => finish(new InspectionLimit()), remaining)
      let settled = false
      const finish = (error?: unknown, data?: ArrayBuffer) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(new Uint8Array(data!))
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) {
        abort()
        return
      }
      void part.arrayBuffer().then(
        (data) => finish(undefined, data),
        (error) => finish(error),
      )
    })
  }
  try {
    const head = await read(0, Math.min(file.size, 32))
    if (head.length >= 8 && mp4Types.has(ascii(head, 4, 4)))
      result.container = 'mp4-family'
    else if (
      [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => head[index] === value)
    )
      result.container = 'matroska-webm'
    else if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'AVI ')
      result.container = 'avi'
    else if (ascii(head, 0, 4) === 'OggS') result.container = 'ogg'
    const extension = file.name.split('.').pop()?.toLowerCase()
    const expected =
      extension &&
      (
        {
          mp4: 'mp4-family',
          m4v: 'mp4-family',
          mov: 'mp4-family',
          mkv: 'matroska-webm',
          webm: 'matroska-webm',
          avi: 'avi',
          ogv: 'ogg',
        } as Record<string, string>
      )[extension]
    if (
      expected &&
      result.container !== 'unknown' &&
      expected !== result.container
    )
      finding(
        'warning',
        'extension-container-mismatch',
        `Extension suggests ${expected}; header indicates ${result.container}. Renaming alone does not repair codecs or damage.`,
      )
    if (result.container === 'unknown') {
      finding(
        'warning',
        'unrecognized-container',
        'Header is not recognized. This may be another format, an incomplete download, or non-video content; inspect with ffprobe.',
      )
      return result
    }
    if (result.container !== 'mp4-family') {
      finding(
        'info',
        'signature-only',
        'Container signature recognized. Internal structure and codec compatibility were not checked; the preview adapter currently qualifies MP4/AVC only.',
      )
      return result
    }
    let offset = 0
    let hasMetadata = false
    let hasMedia = false
    while (offset < file.size) {
      signal.throwIfAborted()
      if (result.coverage.boxes >= boxLimit) throw new InspectionLimit()
      const header = await read(offset, Math.min(16, file.size - offset))
      if (header.length < 8) {
        finding(
          'error',
          'truncated-box-header',
          `Only ${header.length} bytes remain at offset ${offset}; a box header requires at least 8.`,
        )
        return result
      }
      const view = new DataView(
        header.buffer,
        header.byteOffset,
        header.byteLength,
      )
      const type = ascii(header, 4, 4)
      const shortSize = view.getUint32(0)
      if (shortSize === 1 && header.length < 16) {
        finding(
          'error',
          'truncated-box-header',
          `Extended box header is incomplete at offset ${offset}.`,
        )
        return result
      }
      const size =
        shortSize === 0
          ? BigInt(file.size - offset)
          : shortSize === 1
            ? view.getBigUint64(8)
            : BigInt(shortSize)
      const headerSize = (shortSize === 1 ? 16 : 8) + (type === 'uuid' ? 16 : 0)
      if (size < BigInt(headerSize)) {
        finding(
          'error',
          'invalid-box-size',
          `Box ${JSON.stringify(type)} at offset ${offset} declares ${size} bytes, smaller than its header.`,
        )
        return result
      }
      if (size > BigInt(file.size - offset)) {
        finding(
          'error',
          'box-beyond-eof',
          `Box ${JSON.stringify(type)} at offset ${offset} declares ${size} bytes; only ${file.size - offset} remain. Truncation or a malformed length is confirmed.`,
        )
        return result
      }
      hasMetadata ||= type === 'moov'
      hasMedia ||= type === 'mdat'
      result.fragmented ||= type === 'moof'
      result.coverage.boxes++
      offset += Number(size)
    }
    result.coverage.completeTopLevelScan = true
    if (!hasMetadata)
      finding(
        'warning',
        'missing-movie-metadata',
        result.fragmented
          ? 'No moov box: this may be a media fragment requiring a separate initialization segment, not a standalone file.'
          : 'No moov box in a complete top-level scan. A standalone MP4 needs movie metadata; a remux may not recover missing metadata.',
      )
    if (!hasMedia)
      finding(
        'warning',
        'missing-media-data',
        'No mdat box in the complete top-level scan. This may be metadata-only; sample contents were not inspected.',
      )
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof InspectionLimit)
      finding(
        'warning',
        'inspection-limit',
        'Stopped at the read, box-count or 10-second time limit. Unvisited structure is inconclusive.',
      )
    else
      finding(
        'warning',
        'read-failed',
        'The browser could not read the selected file. Check source access and retry; damage is not established.',
      )
  }
  return result
}
