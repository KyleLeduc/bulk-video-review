import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  now: 0,
  encoderAvailable: true,
  avcAvailable: true,
  options: undefined as unknown,
}))
vi.mock('./benchmarkFileReader', () => ({
  createBenchmarkFileReader: (
    _file: File,
    _mode: string,
    metrics: { readMs: number; readMaxMs: number },
  ) => {
    metrics.readMs = metrics.readMaxMs = 1
    return { read: vi.fn(), readBytes: 4, readCalls: 1 }
  },
}))
vi.mock('mediabunny', () => {
  const track = {
    getCodec: async () => 'avc',
    canDecode: async () => true,
    getCodedWidth: async () => 160,
    getCodedHeight: async () => 90,
    getDisplayWidth: async () => 160,
    getDisplayHeight: async () => 90,
    getFirstTimestamp: async () => 0,
    computeDuration: async () => 3,
    isVideoTrack: () => true,
  }
  class StreamTarget {
    constructor(public writable: WritableStream) {}
  }
  class Output {
    constructor(public options: { target: StreamTarget }) {}
  }
  return {
    MP4: {},
    CustomSource: class {},
    Input: class {
      getPrimaryVideoTrack = async () => track
      dispose() {
        state.now = 50
      }
    },
    canEncodeVideo: async (codec: string) =>
      state.encoderAvailable && (codec !== 'avc' || state.avcAvailable),
    Mp4OutputFormat: class {
      mimeType = 'video/mp4'
    },
    WebMOutputFormat: class {
      mimeType = 'video/webm'
    },
    StreamTarget,
    Output,
    Conversion: {
      init: async (options: { output: Output }) => {
        state.options = options
        return {
          isValid: true,
          utilizedTracks: [track],
          execute: async () => {
            const writer = options.output.options.target.writable.getWriter()
            await writer.write({
              type: 'write',
              position: 0,
              data: new Uint8Array([1, 2, 3]),
            })
            await writer.close()
            state.now = 10
          },
          cancel: async () => {
            await Promise.resolve()
            state.now = 30
          },
        }
      },
    },
  }
})
afterEach(() => {
  state.avcAvailable = true
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})
async function run(frameRate: unknown, clipSeconds: unknown = 3) {
  state.now = 0
  const postMessage = vi.fn()
  const worker = {
    postMessage,
    onmessage: undefined as
      | undefined
      | ((event: MessageEvent) => Promise<void>),
  }
  vi.stubGlobal('self', worker)
  vi.stubGlobal('VideoEncoder', class {})
  vi.stubGlobal('VideoDecoder', class {})
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.spyOn(performance, 'now').mockImplementation(() => state.now)
  await import('./clipExtraction.worker')
  await worker.onmessage?.({
    data: { file: new File(['mp4'], 'private.mp4'), frameRate, clipSeconds },
  } as MessageEvent)
  return postMessage.mock.calls[0][0]
}
it.each([0.5, 1, 1.5, 2])(
  'trims and reports %s seconds at 20 FPS',
  async (clipSeconds) => {
    state.encoderAvailable = true
    const reply = await run(20, clipSeconds)
    expect(reply.ok).toBe(true)
    expect(reply.output.clips[0].duration).toBe(clipSeconds)
    expect(state.options).toMatchObject({
      trim: { start: 0, end: clipSeconds },
      video: { frameRate: 20 },
    })
  },
)
it.each([null, 0, 0.25, 4, NaN, '1'])(
  'rejects invalid clip seconds %s before conversion',
  async (clipSeconds) => {
    state.options = undefined
    expect(await run(20, clipSeconds)).toEqual({
      ok: false,
      reason: 'invalid-metadata',
    })
    expect(state.options).toBeUndefined()
  },
)
it.each([10, 20, 24, 30])(
  'uses %i FPS, measures cleanup and strips source tags/audio',
  async (frameRate) => {
    state.encoderAvailable = true
    const reply = await run(frameRate)
    expect(reply.ok).toBe(true)
    expect(reply.output.metrics.firstClipMs).toBe(10)
    expect(reply.output.metrics.totalMs).toBe(50)
    expect(state.options).toMatchObject({
      tags: {},
      audio: { discard: true },
      trim: { start: 0, end: 3 },
      video: { frameRate, forceTranscode: true },
    })
  },
)
it.each([undefined, 0, 60, '24'])(
  'rejects invalid FPS %s without conversion',
  async (frameRate) => {
    state.options = undefined
    const reply = await run(frameRate)
    expect(reply).toEqual({ ok: false, reason: 'invalid-metadata' })
    expect(state.options).toBeUndefined()
  },
)
it('reports unsupported when no candidate encoder is available', async () => {
  state.encoderAvailable = false
  const reply = await run(10)
  expect(reply).toEqual({ ok: false, reason: 'unsupported' })
})
it('selects VP8 and a WebM container when AVC encoding is unavailable', async () => {
  state.encoderAvailable = true
  state.avcAvailable = false
  const reply = await run(10)
  expect(reply.ok).toBe(true)
  expect(reply.output.codec).toBe('vp8')
  expect(reply.output.clips[0].blob.type).toBe('video/webm')
  expect(state.options).toMatchObject({
    video: { codec: 'vp8', forceTranscode: true },
    output: { options: { format: { mimeType: 'video/webm' } } },
  })
})
