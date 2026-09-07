import { afterEach, expect, it, vi } from 'vitest'
import { createPlayerTimelineGuard } from './playerTimeline'
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
const track = (first = -0.05, end = 60) => ({
  getFirstTimestamp: async () => first,
  computeDuration: async () => end,
  getTimeResolution: async () => 1000,
})
it('validates the adjusted timeline without shifting requested player times', async () => {
  const guard = createPlayerTimelineGuard()
  expect(await guard.check(track(), 60)).toBe(0.001)
  await expect(guard.check(track(2), 60)).rejects.toThrow(
    'unsupported-timeline',
  )
  await expect(guard.check(track(0, 55), 60)).rejects.toThrow(
    'unsupported-timeline',
  )
  expect(guard.diagnostics()).toMatchObject({
    trackStart: 0,
    trackEnd: 55,
    storedDuration: 60,
  })
  guard.dispose()
  expect(state.remove).toHaveBeenCalledOnce()
})
it('rejects unsupported edit-list warnings even if they arrive after metadata', async () => {
  const guard = createPlayerTimelineGuard()
  await guard.check(track(), 60)
  state.warn?.(['Unrelated warning'])
  expect(() => guard.assertSupported()).not.toThrow()
  state.warn?.(['Unsupported edit list: private details'])
  expect(() => guard.assertSupported()).toThrow('unsupported-timeline')
  guard.dispose()
})
