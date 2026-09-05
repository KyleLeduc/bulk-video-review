// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'

type Probe = {
  arm(): void
  stop(): null | {
    elapsedMs: number
    firstVisibleThumbnailMs: number | null
    hiddenDuringRun: boolean
    longTasks: {
      supported: boolean
      count: number
      totalMs: number
      maxMs: number
    }
    animationFrames: { count: number; maxGapMs: number }
  }
}
const browser = window as Window & { bvrVideoProbe?: Probe }

afterEach(() => {
  browser.bvrVideoProbe?.stop()
  delete browser.bvrVideoProbe
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('starts at file selection, measures visible thumbnail opportunity and drains long tasks on stop', async () => {
  let clockMs = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs)
  let frame: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback
    return 1
  })
  const cancel = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {})
  const disconnect = vi.fn()
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['longtask']
      observe() {}
      takeRecords() {
        return [
          { startTime: 0, duration: 60 },
          { startTime: 90, duration: 60 },
          { startTime: 160, duration: 60 },
        ]
      }
      disconnect = disconnect
    },
  )
  vi.resetModules()
  await import('./videoProcessingProbe.js')
  const input = document.createElement('input')
  input.type = 'file'
  document.body.append(input)
  browser.bvrVideoProbe!.arm()
  clockMs = 100
  input.dispatchEvent(new Event('change', { bubbles: true }))
  clockMs = 120
  frame(120)
  const card = document.createElement('div')
  card.className = 'card'
  const image = document.createElement('img')
  image.className = 'thumb'
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 160 },
  })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
    width: 160,
    height: 90,
    top: 0,
    bottom: 90,
    left: 0,
    right: 160,
  } as DOMRect)
  card.append(image)
  document.body.append(card)
  clockMs = 180
  frame(180)
  clockMs = 200
  const result = browser.bvrVideoProbe!.stop()
  expect(result).not.toBeNull()
  expect(result).toMatchObject({
    elapsedMs: 100,
    firstVisibleThumbnailMs: 80,
    longTasks: { supported: true, count: 2, totalMs: 90, maxMs: 50 },
    animationFrames: { count: 2, maxGapMs: 60 },
  })
  expect(disconnect).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalled()
  expect(browser.bvrVideoProbe!.stop()).toBeNull()
})

test('reports unavailable long-task API explicitly and cancels an armed probe without selection', async () => {
  vi.stubGlobal('PerformanceObserver', undefined)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.resetModules()
  await import('./videoProcessingProbe.js')
  browser.bvrVideoProbe!.arm()
  expect(() => browser.bvrVideoProbe!.arm()).toThrow(/already armed/)
  expect(browser.bvrVideoProbe!.stop()).toBeNull()
  browser.bvrVideoProbe!.arm()
  const input = document.createElement('input')
  input.type = 'file'
  document.body.append(input)
  input.dispatchEvent(new Event('change', { bubbles: true }))
  expect(browser.bvrVideoProbe!.stop()).toMatchObject({
    firstVisibleThumbnailMs: null,
    longTasks: { supported: false, count: 0 },
  })
})
