import { afterEach, expect, it, vi } from 'vitest'
import { createPlayerTimelineGuard } from './playerTimeline'
import {
  keyframeTargets,
  motionClipWindows,
} from '@domain/services/videoPreviewPolicy'
const state = vi.hoisted(() => ({
  warn: undefined as undefined | ((args: unknown[]) => void),
  remove: vi.fn(),
}))
vi.mock('mediabunny', () => ({
  Logging: {
    on: (_event: string, listener: (args: unknown[]) => void) => {
      state.warn = listener
      return state.remove
    },
  },
}))
afterEach(() => vi.clearAllMocks())
const track = (first = -0.05, end = 60, resolution = 1000) => ({
  getFirstTimestamp: async () => first,
  computeDuration: async () => end,
  getTimeResolution: async () => resolution,
})
it('leaves in-range requests unchanged without shifting by a negative first packet', async () => {
  const guard = createPlayerTimelineGuard()
  const range = await guard.check(track(), 60)
  expect(range.tolerance).toBe(0.001)
  expect(range.clampTimestamp(0)).toBe(0)
  expect(range.clampTimestamp(30)).toBe(30)
  expect(range.clampWindow({ start: 30, end: 31.5 })).toEqual({
    start: 30,
    end: 31.5,
  })
  expect(guard.diagnostics()).toMatchObject({
    trackStart: -0.05,
    trackEnd: 60,
    storedDuration: 60,
  })
  guard.dispose()
  expect(state.remove).toHaveBeenCalledOnce()
})
// Exact owner-reported NAS metadata. File numbers are selection-local, not identities.
it.each([
  [1, 0, 2719.383333333333, 2719.423991, 24000],
  [2, 0, 2805.4693333333335, 2805.503991, 24000],
  [3, 0.033, 2494.8663333333334, 2494.868027, 90000],
  [4, 0, 3465.587125, 3465.620998, 24000],
  [5, 0.046, 2142.3945416666666, 2142.49288, 24000],
  [6, 0, 2682.5965833333335, 2682.670998, 24000],
  [7, 0, 1957.08, 1957.12, 12800],
  [8, 0, 3465.587125, 3465.620998, 24000],
  [9, 0, 2977.8081666666667, 2977.912744, 24000],
])(
  'samples every slot for owner file %i within available video',
  async (_file, first, end, duration, resolution) => {
    const guard = createPlayerTimelineGuard()
    const range = await guard.check(track(first, end, resolution), duration)
    const targets = keyframeTargets(duration).map(range.clampTimestamp)
    const windows = motionClipWindows(duration).map(range.clampWindow)
    expect(targets).toHaveLength(100)
    expect(windows).toHaveLength(10)
    expect(targets[0]).toBe(first)
    for (const target of targets) {
      expect(target).toBeGreaterThanOrEqual(first)
      expect(target).toBeLessThan(end)
    }
    for (const window of windows) {
      expect(window.start).toBeGreaterThanOrEqual(first)
      expect(window.end).toBeLessThanOrEqual(end)
      expect(window.end - window.start).toBeCloseTo(1.5, 8)
    }
    expect(guard.diagnostics().timelineReason).toBeUndefined()
    guard.dispose()
  },
)
it('bounds tail requests and moves a full clip earlier when possible', async () => {
  const guard = createPlayerTimelineGuard()
  const range = await guard.check(track(0.04, 59.9), 60)
  expect(range.clampTimestamp(60)).toBeCloseTo(59.899, 8)
  expect(range.clampWindow({ start: 59, end: 60.5 })).toEqual({
    start: 58.4,
    end: 59.9,
  })
  expect(range.clampWindow({ start: 0, end: 1.5 })).toEqual({
    start: 0.04,
    end: 1.54,
  })
})
it('shortens a clip only when the whole available interval is shorter', async () => {
  const range = await createPlayerTimelineGuard().check(track(0.04, 0.8), 1)
  expect(range.clampWindow({ start: 0, end: 1 })).toEqual({
    start: 0.04,
    end: 0.8,
  })
})
it('keeps an interval shorter than a timestamp tick usable', async () => {
  const range = await createPlayerTimelineGuard().check(track(0, 0.0001), 1)
  expect(range.clampTimestamp(1)).toBe(0)
})
it('never extends samples beyond the player interval when the track is longer', async () => {
  const range = await createPlayerTimelineGuard().check(track(0, 120), 60)
  expect(range.clampTimestamp(90)).toBe(59.999)
  expect(range.clampWindow({ start: 90, end: 91.5 })).toEqual({
    start: 58.5,
    end: 60,
  })
})
it('rejects unsupported edit-list warnings even if they arrive after metadata', async () => {
  const guard = createPlayerTimelineGuard()
  await guard.check(track(), 60)
  state.warn?.(['Unrelated warning'])
  expect(() => guard.assertSupported()).not.toThrow()
  state.warn?.(['Unsupported edit list: private details'])
  expect(() => guard.assertSupported()).toThrow('unsupported-timeline')
  expect(guard.diagnostics()).toMatchObject({
    timelineReason: 'unsupported-edit-list',
    timeResolution: 1000,
  })
  guard.dispose()
})
it.each([
  { first: 0, end: 0, duration: 60 },
  { first: 2, end: 1, duration: 60 },
  { first: -2, end: -1, duration: 60 },
  { first: 61, end: 65, duration: 60 },
  { first: 0, end: 60, duration: NaN },
  { first: Infinity, end: 60, duration: 60 },
  { first: 0, end: Infinity, duration: 60 },
])(
  'rejects an invalid or empty player/track intersection ($first, $end, $duration)',
  async ({ first, end, duration }) => {
    const guard = createPlayerTimelineGuard()
    await expect(guard.check(track(first, end), duration)).rejects.toThrow(
      'unsupported-timeline',
    )
    expect(guard.diagnostics()).toMatchObject({
      timelineReason: 'invalid-timing',
      timeResolution: 1000,
      trackStart: first,
      trackEnd: end,
    })
    guard.dispose()
  },
)
it.each([0, -1, NaN, Infinity, Number.MIN_VALUE])(
  'rejects invalid time resolution %s',
  async (resolution) => {
    await expect(
      createPlayerTimelineGuard().check(track(0, 60, resolution), 60),
    ).rejects.toThrow('unsupported-timeline')
  },
)
