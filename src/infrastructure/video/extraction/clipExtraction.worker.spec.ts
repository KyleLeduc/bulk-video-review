import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  now: 0,
  encoderAvailable: true,
  avcAvailable: true,
  options: undefined as unknown,
  trims: [] as Array<{ start: number; end: number }>,
  first: 0,
  end: 3,
  warnOnConversion: false,
  failCleanup: false,
  warn: undefined as undefined | ((args: unknown[]) => void),
  removeWarning: vi.fn(),
}))
vi.mock('./fileReader', () => ({
  createFileReader: (
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
    getFirstTimestamp: async () => state.first,
    computeDuration: async () => state.end,
    getTimeResolution: async () => 1000,
    isVideoTrack: () => true,
  }
  class StreamTarget {
    constructor(public writable: WritableStream) {}
  }
  class Output {
    constructor(public options: { target: StreamTarget }) {}
  }
  return {
    Logging: {
      on: (_event: string, listener: (args: unknown[]) => void) => {
        state.warn = listener
        return state.removeWarning
      },
    },
    MP4: {},
    CustomSource: class {},
    Input: class {
      getPrimaryVideoTrack = async () => track
      dispose() {
        state.now = 50
        if (state.failCleanup) throw new Error('private cleanup details')
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
      init: async (options: {
        output: Output
        trim: { start: number; end: number }
      }) => {
        state.options = options
        state.trims.push(options.trim)
        return {
          isValid: true,
          utilizedTracks: [track],
          execute: async () => {
            if (state.warnOnConversion)
              state.warn?.(['Unsupported edit list: multiple edits'])
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
  state.first = 0
  state.end = 3
  state.trims = []
  state.encoderAvailable = true
  state.warnOnConversion = false
  state.failCleanup = false
  state.removeWarning.mockClear()
  state.avcAvailable = true
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})
it('retains timeline evidence when cleanup also fails', async () => {
  state.first = 5
  state.failCleanup = true
  const messages = await run(20, 1.5, 3, 'motion', true)
  expect(messages.at(-1)).toMatchObject({
    ok: false,
    reason: 'unsupported-timeline',
    diagnostics: { trackStart: 5, cleanupFailed: true },
  })
  expect(JSON.stringify(messages)).not.toContain('private cleanup')
})
it('returns safe failure evidence even when benchmark progress is disabled', async () => {
  state.encoderAvailable = true
  state.end = 0
  const reply = await run(20, 1.5, 3)
  expect(reply).toMatchObject({
    ok: false,
    reason: 'unsupported-timeline',
    diagnostics: {
      stage: 'timeline',
      codec: 'avc',
      trackStart: 0,
      trackEnd: 0,
      storedDuration: 3,
      timeResolution: 1000,
      timelineReason: 'invalid-timing',
      readBytes: 4,
      readCalls: 1,
    },
  })
  expect(JSON.stringify(reply)).not.toMatch(/private|stack|message/)
})
it('bounds motion trims around leading gaps and short tails, preserving nominal slots', async () => {
  state.first = 0.046
  state.end = 4.4
  const reply = await run(20, 1.5, 6)
  expect(reply.ok).toBe(true)
  expect(state.trims).toHaveLength(2)
  expect(state.trims[0]).toEqual({ start: 0.046, end: 1.546 })
  expect(state.trims[1].start).toBeCloseTo(2.9, 8)
  expect(state.trims[1].end).toBe(4.4)
  expect(
    reply.output.clips.map((clip: { start: number }) => clip.start),
  ).toEqual([0, 3])
  expect(
    reply.output.clips.map((clip: { duration: number }) => clip.duration),
  ).toEqual([1.5, 1.5])
})
it('reports the shorter actual trim length when a whole track cannot fill the slot', async () => {
  state.first = 0.04
  state.end = 0.8
  const reply = await run(20, 1.5, 1)
  expect(reply.ok).toBe(true)
  expect(state.trims).toEqual([{ start: 0.04, end: 0.8 }])
  expect(reply.output.clips).toHaveLength(1)
  expect(reply.output.clips[0]).toMatchObject({ start: 0, duration: 0.76 })
})
it('keeps every nominal clip slot when only a short usable track is available', async () => {
  state.first = 0.05
  state.end = 0.85
  const reply = await run(20, 1.5, 60)
  expect(reply.ok).toBe(true)
  expect(state.trims).toHaveLength(10)
  for (const trim of state.trims) {
    expect(trim.start).toBeCloseTo(0.05, 8)
    expect(trim.end).toBe(0.85)
  }
  expect(
    reply.output.clips.map((clip: { start: number }) => clip.start),
  ).toEqual(Array.from({ length: 10 }, (_, i) => i * 6))
  for (const clip of reply.output.clips)
    expect(clip.duration).toBeCloseTo(0.8, 8)
})
async function run(
  frameRate: unknown,
  clipSeconds: unknown = 3,
  duration?: number,
  kind = 'motion',
  progress = false,
) {
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
    data: {
      file: new File(['mp4'], 'private.mp4'),
      frameRate,
      clipSeconds,
      progress,
      ...(duration === undefined ? {} : { kind, duration }),
    },
  } as MessageEvent)
  return progress
    ? postMessage.mock.calls.map((call) => call[0])
    : postMessage.mock.calls[0][0]
}
it('emits each encoded clip before the final reply, without filenames', async () => {
  state.encoderAvailable = true
  state.end = 6
  const replies = await run(20, 1.5, 6, 'motion', true)
  expect(
    replies
      .filter((reply: { type?: string }) => reply.type === 'progress')
      .map((reply: { completed: number }) => reply.completed),
  ).toEqual([1, 2])
  expect(replies.at(-1)).toMatchObject({ ok: true })
  expect(JSON.stringify(replies)).not.toContain('private.mp4')
})
it('uses explicit player time for motion instead of shifting by a negative packet start', async () => {
  state.encoderAvailable = true
  state.first = -1
  state.end = 6
  const reply = await run(20, 1.5, 6)
  expect(reply.ok).toBe(true)
  expect(
    reply.output.clips.map((clip: { start: number }) => clip.start),
  ).toEqual([0, 3])
  expect(state.options).toMatchObject({
    trim: { start: 3, end: 4.5 },
    video: { frameRate: 20 },
  })
  expect(state.removeWarning).toHaveBeenCalledOnce()
})
it('discards production motion when conversion discovers unsupported edits', async () => {
  state.encoderAvailable = true
  state.warnOnConversion = true
  expect(await run(20, 1.5, 3)).toEqual({
    ok: false,
    reason: 'unsupported-timeline',
    diagnostics: expect.objectContaining({
      timelineReason: 'unsupported-edit-list',
    }),
  })
  expect(state.removeWarning).toHaveBeenCalledOnce()
})
it('rejects unknown workloads instead of running a legacy benchmark', async () => {
  expect(await run(20, 1.5, 3, 'unknown')).toEqual({
    ok: false,
    reason: 'invalid-metadata',
    diagnostics: expect.objectContaining({ stage: 'setup' }),
  })
})
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
      diagnostics: expect.objectContaining({ stage: 'setup' }),
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
    expect(reply).toEqual({
      ok: false,
      reason: 'invalid-metadata',
      diagnostics: expect.objectContaining({ stage: 'setup' }),
    })
    expect(state.options).toBeUndefined()
  },
)
it('reports unsupported when no candidate encoder is available', async () => {
  state.encoderAvailable = false
  const reply = await run(10)
  expect(reply).toEqual({
    ok: false,
    reason: 'unsupported',
    diagnostics: expect.objectContaining({ codec: 'avc' }),
  })
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
