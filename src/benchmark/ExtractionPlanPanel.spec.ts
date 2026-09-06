import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import ExtractionPlanPanel from './ExtractionPlanPanel.vue'
import * as runner from './runExtractionBenchmark'
import { planSteps } from './extractionPlans'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const props = {
  build: { revision: null, dirty: null, assetsSha256: null },
  files: [new File(['x'], 'private.mp4')],
  selectionId: 'selection',
  disabled: false,
  busy: false,
}
it.each(['stale play rejection', 'media error'] as const)(
  'handles %s without silent playback failure',
  async (failure) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let rejectOld: (error: Error) => void = () => {}
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const load = vi
      .spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {})
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectOld = reject
          }),
      )
      .mockResolvedValue(undefined)
    vi.spyOn(runner, 'runExtractionPlan').mockImplementation(
      async (options) => {
        options.onClipSample?.(
          {
            file: 1,
            output: {
              clips: [
                {
                  blob: new Blob(['mp4'], { type: 'video/mp4' }),
                  start: 0,
                  duration: 3,
                },
              ],
              codec: 'avc',
              width: 320,
              height: 180,
              readBytes: 1,
              readCalls: 1,
              metrics: {
                setupMs: 0,
                conversionMs: 1,
                firstClipMs: 1,
                totalMs: 1,
                readMs: 0,
                readMaxMs: 0,
              },
            },
          },
          {
            id: 'quality',
            pass: 1,
            workload: 'clips',
            execution: 'mediabunny',
            jobs: 1,
            frameRate: 24,
          },
        )
        return report()
      },
    )
    const wrapper = mount(ExtractionPlanPanel, { props })
    await wrapper.get('[data-test=plan-start]').trigger('click')
    await flushPromises()
    if (!play.mock.calls.length)
      await wrapper.get('video').trigger('loadeddata')
    if (failure === 'stale play rejection') {
      await wrapper.get('[data-test=clip-playback]').trigger('click')
      await wrapper.get('[data-test=clip-playback]').trigger('click')
      rejectOld(new Error('superseded autoplay'))
      await flushPromises()
      expect(wrapper.get('[data-test=clip-playback]').text()).toContain('Pause')
      expect(wrapper.text()).not.toContain('Playback did not start')
    } else {
      await wrapper.get('video').trigger('error')
      expect(wrapper.get('[data-test=clip-playback]').text()).toContain(
        'Resume',
      )
      expect(wrapper.text()).toContain('could not be played')
      Object.defineProperty(wrapper.get('video').element, 'error', {
        configurable: true,
        value: { code: 3 },
      })
      load.mockClear()
      play.mockClear()
      await wrapper.get('[data-test=clip-playback]').trigger('click')
      await flushPromises()
      expect(load).toHaveBeenCalledTimes(1)
      expect(play).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-test=clip-playback]').text()).toContain('Pause')
      expect(wrapper.text()).not.toContain('could not be played')
    }
    wrapper.unmount()
  },
)
it('disables plan exports while an external manual benchmark is timing', async () => {
  vi.spyOn(runner, 'runExtractionPlan').mockResolvedValue(report())
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:download')
  const wrapper = mount(ExtractionPlanPanel, { props })
  await wrapper.get('[data-test=plan-start]').trigger('click')
  await flushPromises()
  await wrapper.setProps({ busy: true })
  for (const button of ['plan-copy', 'plan-download']) {
    expect(
      wrapper.get(`[data-test=${button}]`).attributes('disabled'),
    ).toBeDefined()
    await wrapper.get(`[data-test=${button}]`).trigger('click')
  }
  expect(writeText).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  wrapper.unmount()
})
function report(): runner.ExtractionPlanReport {
  return {
    schemaVersion: 1,
    mode: 'extraction-plan-v1',
    preset: 'clips-3s-v1',
    status: 'completed',
    hidden: false,
    errors: [],
    plannedSteps: planSteps('clips-3s-v1'),
    results: [],
    wallMs: 100,
    selection: { id: 'selection', sizes: [1], verification: 'selection-only' },
    identity: { build: props.build, userAgent: 'test', cacheScope: 'shared' },
  }
}
it('gates starting, freezes the preset, stops and retains copyable partial JSON', async () => {
  let signal: AbortSignal | undefined
  vi.spyOn(runner, 'runExtractionPlan').mockImplementation(async (options) => {
    signal = options.signal
    await new Promise<void>((resolve) =>
      options.signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    return { ...report(), status: 'interrupted' }
  })
  const wrapper = mount(ExtractionPlanPanel, {
    props: { ...props, disabled: true },
  })
  expect(
    wrapper.get('[data-test=plan-start]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.setProps({ disabled: false })
  await wrapper.get('[data-test=plan-start]').trigger('click')
  expect(
    wrapper.get('[data-test=plan-preset]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.get('[data-test=plan-stop]').trigger('click')
  await flushPromises()
  expect(signal?.aborted).toBe(true)
  expect(
    wrapper.get<HTMLTextAreaElement>('[data-test=plan-json]').element.value,
  ).toContain('interrupted')
  expect(wrapper.emitted('active')).toEqual([[true], [false]])
  wrapper.unmount()
})
it.each([false, true])(
  'respects reduced motion %s, cycles one noninteractive video and cleans up',
  async (reducedMotion) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }))
    let url = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:clip-${++url}`,
    )
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(runner, 'runExtractionPlan').mockImplementation(
      async (options) => {
        for (const frameRate of [10, 24] as const) {
          options.onClipSample?.(
            {
              file: 1,
              output: {
                clips: [
                  {
                    blob: new Blob(['mp4'], { type: 'video/mp4' }),
                    start: 0,
                    duration: 3,
                  },
                  {
                    blob: new Blob(['mp4-2'], { type: 'video/mp4' }),
                    start: 6,
                    duration: 3,
                  },
                ],
                codec: 'avc',
                width: 320,
                height: 180,
                readBytes: 1,
                readCalls: 1,
                metrics: {
                  setupMs: 0,
                  conversionMs: 1,
                  firstClipMs: 1,
                  totalMs: 1,
                  readMs: 0,
                  readMaxMs: 0,
                },
              },
            },
            {
              id: `quality-${frameRate}`,
              pass: 1,
              workload: 'clips',
              execution: 'mediabunny',
              jobs: 1,
              frameRate,
            },
          )
        }
        return report()
      },
    )
    const wrapper = mount(ExtractionPlanPanel, { props })
    await wrapper.get('[data-test=plan-preset]').setValue('clips-3s-v1')
    await wrapper.get('[data-test=plan-start]').trigger('click')
    await flushPromises()
    const video = wrapper.get<HTMLVideoElement>('video').element
    expect(wrapper.findAll('video')).toHaveLength(1)
    expect(video.loop).toBe(false)
    expect(video.muted).toBe(true)
    expect(video.autoplay).toBe(!reducedMotion)
    expect(video.controls).toBe(false)
    expect(video.tabIndex).toBe(-1)
    expect(video.src).toContain('blob:clip-1')
    if (reducedMotion) {
      expect(wrapper.get('[data-test=clip-playback]').text()).toContain(
        'Resume',
      )
      await wrapper.get('video').trigger('ended')
      expect(video.src).toContain('blob:clip-1')
      await wrapper.get('[data-test=clip-playback]').trigger('click')
      expect(wrapper.get('[data-test=clip-playback]').text()).toContain('Pause')
    }
    await wrapper.get('video').trigger('ended')
    expect(video.src).toContain('blob:clip-2')
    await wrapper.get('video').trigger('ended')
    expect(video.src).toContain('blob:clip-1')
    await wrapper.get('[data-test=clip-variant]').setValue('1')
    expect(video.src).toContain('blob:clip-3')
    expect(wrapper.get('[data-test=clip-samples]').text()).toContain('24 FPS')
    await wrapper.get('[data-test=clip-playback]').trigger('click')
    expect(wrapper.get('[data-test=clip-playback]').text()).toContain('Resume')
    expect(
      wrapper.get<HTMLTextAreaElement>('[data-test=plan-json]').element.value,
    ).not.toContain('blob:')
    await wrapper.setProps({ selectionId: 'new-selection' })
    expect(revoke).toHaveBeenCalledTimes(4)
    expect(wrapper.find('video').exists()).toBe(false)
    wrapper.unmount()
  },
)
