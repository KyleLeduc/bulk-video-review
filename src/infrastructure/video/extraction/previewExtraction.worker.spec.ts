// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  events: [] as string[],
  fail: false,
  end: 60,
  sinkTargets: [] as number[],
  timestamps: 'valid' as
    | 'valid'
    | 'future'
    | 'backward'
    | 'nan'
    | 'warning'
    | 'empty',
  warn: undefined as undefined | ((args: unknown[]) => void),
  read: undefined as
    | undefined
    | ((start: number, end: number) => Promise<Uint8Array>),
}))
vi.mock('mediabunny', () => ({
  Logging: {
    on: (_event: string, listener: (args: unknown[]) => void) => {
      state.warn = listener
      return () => {}
    },
  },
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
        getFirstTimestamp: async () => -0.1,
        computeDuration: async () => state.end,
        getTimeResolution: async () => 1000,
      }
    }
    dispose() {
      state.events.push('dispose')
    }
  },
  CanvasSink: class {
    async *canvasesAtTimestamps(targets: number[]) {
      state.sinkTargets = targets
      if (state.timestamps === 'empty') return
      for (let i = 0; i < targets.length; i++) {
        if (state.timestamps === 'warning')
          state.warn?.(['Unsupported edit list: rate'])
        const timestamp =
          state.timestamps === 'future'
            ? targets[i] + 5
            : state.timestamps === 'nan'
              ? NaN
              : state.timestamps === 'backward' && i === 2
                ? -1
                : targets[i]
        yield {
          canvas: new OffscreenCanvas(160, 90),
          timestamp,
          duration: 0.05,
        }
      }
    }
  },
}))
afterEach(() => {
  state.end = 60
  state.timestamps = 'valid'
  vi.unstubAllGlobals()
  vi.resetModules()
})
it('returns timeline evidence without enabling benchmark progress traffic', async () => {
  state.end = 59.97
  const reply = await runKeyframes()
  expect(reply).toMatchObject({
    ok: false,
    reason: 'unsupported-timeline',
    diagnostics: {
      stage: 'timeline',
      codec: 'avc',
      trackEnd: 59.97,
      storedDuration: 60,
      timelineReason: 'track-ends-before-player',
      timeResolution: 1000,
      readBytes: 3,
      readCalls: 1,
    },
  })
  expect(JSON.stringify(reply)).not.toMatch(/private|stack|message/)
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

async function runKeyframes(progress = false) {
  state.fail = false
  const host = { onmessage: null as unknown, postMessage: vi.fn() }
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
      file: new File(['mp4'], 'private.mp4'),
      kind: 'keyframes',
      duration: 60,
      maxWidth: 160,
      progress,
    },
  })
  return progress
    ? host.postMessage.mock.calls.map((call) => call[0])
    : host.postMessage.mock.calls[0][0]
}
it('emits real encoded seek counts before final completion', async () => {
  const replies = await runKeyframes(true)
  expect(
    replies
      .filter((reply: { type?: string }) => reply.type === 'progress')
      .map((reply: { completed: number }) => reply.completed),
  ).toEqual([1, 2, 3, 4])
  expect(replies.at(-1)).toMatchObject({ ok: true })
})
it('extracts a distinct keyframe workload with player-time targets and small dimensions', async () => {
  const reply = await runKeyframes()
  expect(state.sinkTargets).toEqual([0, 15, 30, 45])
  expect(reply).toMatchObject({ ok: true, output: { width: 160, height: 90 } })
  expect(reply.output.frames).toHaveLength(4)
})
it.each(['future', 'backward', 'nan', 'warning', 'empty'] as const)(
  'rejects %s keyframe output without a partial product',
  async (kind) => {
    state.timestamps = kind
    expect(await runKeyframes()).toEqual({
      ok: false,
      reason: kind === 'empty' ? 'output-invalid' : 'unsupported-timeline',
      diagnostics: expect.any(Object),
    })
  },
)
