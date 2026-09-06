// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  events: [] as string[],
  fail: false,
  read: undefined as
    | undefined
    | ((start: number, end: number) => Promise<Uint8Array>),
}))
vi.mock('mediabunny', () => ({
  MP4: {},
  CustomSource: class {
    constructor(options: {
      read: (start: number, end: number) => Promise<Uint8Array>
    }) {
      state.read = options.read
    }
  },
  Input: class {
    async getPrimaryVideoTrack() {
      if (state.fail) throw new Error('private input')
      await state.read!(0, 1)
      await state.read!(1, 2)
      return {
        getCodec: async () => 'avc',
        getCodedWidth: async () => 160,
        getCodedHeight: async () => 90,
        getDisplayWidth: async () => 160,
        getDisplayHeight: async () => 90,
        canDecode: async () => true,
      }
    }
    dispose() {
      state.events.push('dispose')
    }
  },
  CanvasSink: class {
    async *canvasesAtTimestamps(targets: number[]) {
      for (let i = 0; i < targets.length; i++)
        yield { canvas: new OffscreenCanvas(160, 90) }
    }
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
it.each([
  { fail: false, readerMode: 'direct', count: 9 },
  { fail: false, readerMode: 'buffered-1mib', count: 9 },
  { fail: false, readerMode: 'direct', count: 100 },
  { fail: false, readerMode: 'buffered-1mib', count: 100 },
  { fail: true, readerMode: 'direct', count: 9 },
])(
  'uses selected reader and disposes before publishing ($readerMode, failure=$fail)',
  async ({ fail, readerMode, count }) => {
    state.events = []
    state.fail = fail
    const host = {
      onmessage: null as unknown,
      postMessage: vi.fn<(reply: unknown) => void>(() => {
        state.events.push('reply')
      }),
    }
    vi.stubGlobal('self', host)
    vi.stubGlobal('VideoDecoder', class {})
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        async convertToBlob() {
          return new Blob(['jpeg'], { type: 'image/jpeg' })
        }
      },
    )
    await import('./previewExtraction.worker')
    await (host.onmessage as (event: unknown) => Promise<void>)({
      data: {
        file: new File([new Uint8Array(2 * 1024 * 1024)], 'secret.mp4'),
        readerMode,
        prepared: {
          width: 160,
          height: 90,
          targets: Array.from(
            { length: count },
            (_, i) => (i + 1) / (count + 1),
          ),
        },
      },
    })
    expect(state.events).toEqual(['dispose', 'reply'])
    const reply = host.postMessage.mock.calls[0] as unknown[]
    expect(reply[0]).toMatchObject({ ok: !fail })
    if (!fail)
      expect(reply[0]).toMatchObject({
        output: {
          readCalls: readerMode === 'direct' ? 2 : 1,
          readBytes: readerMode === 'direct' ? 2 : 1024 * 1024,
        },
      })
    expect(JSON.stringify(reply)).not.toContain('private input')
    if (!fail)
      expect(
        (reply[0] as { output: { frames: Blob[] } }).output.frames,
      ).toHaveLength(count)
  },
)
