import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ events: [] as string[], fail: false }))
vi.mock('mediabunny', () => ({
  MP4: {},
  CustomSource: class {},
  Input: class {
    async getPrimaryVideoTrack() {
      if (state.fail) throw new Error('private input')
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
    async *canvasesAtTimestamps() {
      for (let i = 0; i < 9; i++) yield { canvas: new OffscreenCanvas(160, 90) }
    }
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
it.each([false, true])(
  'disposes before publishing success/failure (%s)',
  async (fail) => {
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
        file: new File(['x'], 'secret.mp4'),
        prepared: {
          width: 160,
          height: 90,
          targets: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
      },
    })
    expect(state.events).toEqual(['dispose', 'reply'])
    const reply = host.postMessage.mock.calls[0] as unknown[]
    expect(reply[0]).toMatchObject({ ok: !fail })
    expect(JSON.stringify(reply)).not.toContain('private input')
  },
)
