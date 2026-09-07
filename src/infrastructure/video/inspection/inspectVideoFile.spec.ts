// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { inspectVideoFile } from './inspectVideoFile'

function box(
  type: string,
  payload = new Uint8Array(0),
  size = payload.length + 8,
) {
  const header = new Uint8Array(8)
  new DataView(header.buffer).setUint32(0, size)
  header.set(new TextEncoder().encode(type), 4)
  return new Blob([header, payload])
}
const scan = (file: File, maxBoxes?: number) =>
  inspectVideoFile(file, { signal: new AbortController().signal, maxBoxes })
describe('bounded read-only file inspection', () => {
  it.each([true, false])(
    'accepts metadata before or after media: %s',
    async (front) => {
      const parts = [box('moov'), box('mdat', new Uint8Array(1024))]
      const result = await scan(
        new File([box('ftyp'), ...(front ? parts : parts.reverse())], 'a.mp4'),
      )
      expect(result.container).toBe('mp4-family')
      expect(result.coverage.completeTopLevelScan).toBe(true)
      expect(result.coverage.readBytes).toBeLessThan(100)
      expect(result.findings.some((item) => item.severity === 'error')).toBe(
        false,
      )
      expect(result.decodeChecked).toBe(false)
    },
  )
  it('detects a declared box beyond the file, but never labels an early stop as missing metadata', async () => {
    const truncated = await scan(
      new File(
        [box('ftyp'), box('mdat', new Uint8Array(0), 1000)],
        'short.mp4',
      ),
    )
    expect(truncated.findings.map((item) => item.code)).toContain(
      'box-beyond-eof',
    )
    const bounded = await scan(
      new File(
        [box('ftyp'), box('free'), box('moov'), box('mdat')],
        'many.mp4',
      ),
      1,
    )
    expect(bounded.coverage.completeTopLevelScan).toBe(false)
    expect(bounded.findings.map((item) => item.code)).toEqual([
      'inspection-limit',
    ])
  })
  it('accepts extended and end-of-file sizes and valid fragment box boundaries', async () => {
    const extended = new Uint8Array(16)
    const view = new DataView(extended.buffer)
    view.setUint32(0, 1)
    extended.set(new TextEncoder().encode('free'), 4)
    view.setBigUint64(8, 16n)
    const result = await scan(
      new File(
        [
          box('ftyp'),
          box('moov'),
          extended,
          box('moof'),
          box('mdat', new Uint8Array(4), 0),
        ],
        'fragments.mp4',
      ),
    )
    expect(result.coverage.completeTopLevelScan).toBe(true)
    expect(result.fragmented).toBe(true)
    expect(result.findings.some((item) => item.severity === 'error')).toBe(
      false,
    )
  })
  it('rejects undersized and unsafe extended sizes without reading payloads', async () => {
    const bad = await scan(
      new File([box('ftyp'), box('mdat', new Uint8Array(0), 4)], 'bad.mp4'),
    )
    expect(bad.findings.map((item) => item.code)).toContain('invalid-box-size')
    const extended = new Uint8Array(16)
    new DataView(extended.buffer).setUint32(0, 1)
    extended.set(new TextEncoder().encode('mdat'), 4)
    new DataView(extended.buffer).setBigUint64(8, 2n ** 60n)
    expect(
      (await scan(new File([box('ftyp'), extended], 'bad.mp4'))).findings.map(
        (item) => item.code,
      ),
    ).toContain('box-beyond-eof')
  })
  it('separates a wrong extension from damage and unknown formats from healthy files', async () => {
    const result = await scan(
      new File(
        [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])],
        'wrong.mp4',
      ),
    )
    expect(result.container).toBe('matroska-webm')
    expect(result.findings.map((item) => item.code)).toContain(
      'extension-container-mismatch',
    )
    expect(result.findings.some((item) => item.severity === 'error')).toBe(
      false,
    )
    expect(
      (await scan(new File(['nonsense'], 'unknown.mp4'))).findings.map(
        (item) => item.code,
      ),
    ).toContain('unrecognized-container')
  })
  it('honors cancellation before any reads', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      inspectVideoFile(new File([], 'empty.mp4'), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
