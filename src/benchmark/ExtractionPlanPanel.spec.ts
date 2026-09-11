import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import ExtractionPlanPanel from './ExtractionPlanPanel.vue'
import * as runner from './runExtractionBenchmark'
import { planSteps } from './extractionPlans'
import MotionPreview from '../presentation/components/MotionPreview.vue'
import SeekPreviewTooltip from '../presentation/components/SeekPreviewTooltip.vue'
import { emptyMetrics } from '../infrastructure/video/extraction/previewExtraction'
import type { KeyframeReport } from './runKeyframeBenchmark'

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
it('labels seek backend samples separately and keeps failed backends unavailable', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:native-seek')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(runner, 'runExtractionPlan').mockImplementation(async (options) => {
    const result: runner.ExtractionPlanReport = {
      ...report(),
      preset: 'seek-backends-v1',
      status: 'failed',
      plannedSteps: planSteps('seek-backends-v1'),
    }
    for (const step of result.plannedSteps.slice(0, 2)) {
      if (step.workload !== 'keyframes') throw new Error('Wrong preset')
      const failed = step.execution === 'mediabunny'
      const evidence: KeyframeReport = {
        schemaVersion: 1,
        mode: 'keyframe-extraction-v1',
        status: failed ? 'failed' : 'completed',
        settings: {
          jobs: step.jobs,
          execution: step.execution,
          samplingPolicy: '15s-max100',
          maxWidth: 160,
          quality: 0.72,
          readerMode: failed ? 'buffered-1mib' : null,
          maxReadBytes: failed ? 1073741824 : null,
          maxOutputBytes: 16777216,
          deadlineMs: 120000,
          candidate: 'mediabunny@1.55.7',
        },
        selection: result.selection,
        identity: result.identity,
        peakActiveJobs: 1,
        wallMs: 150,
        rows: [
          {
            file: 1,
            status: failed ? 'failed' : 'passed',
            reason: failed ? 'unsupported-timeline' : null,
            expectedFrames: 1,
            frames: failed ? 0 : 1,
            outputBytes: failed ? 0 : 3,
            width: failed ? null : 160,
            height: failed ? null : 90,
            readBytes: null,
            readCalls: null,
            metrics: null,
            wallMs: 150,
          },
        ],
      }
      const entry = { step, report: evidence }
      result.results.push(entry)
      options.onStep?.(entry, result.results.length)
      if (!failed)
        options.onKeyframeSample?.(
          {
            file: 1,
            duration: 1,
            output: {
              frames: [new Blob(['jpg'], { type: 'image/jpeg' })],
              width: 160,
              height: 90,
              readBytes: null,
              readCalls: null,
              metrics: emptyMetrics(),
            },
          },
          step,
        )
    }
    return result
  })
  const wrapper = mount(ExtractionPlanPanel, { props })
  await wrapper.get('[data-test=plan-preset]').setValue('seek-backends-v1')
  expect(wrapper.text()).toContain('8 configurations')
  expect(wrapper.text()).not.toContain('Production clips plus')
  await wrapper.get('[data-test=plan-start]').trigger('click')
  await flushPromises()
  expect(
    wrapper.get('[data-test=keyframe-backend-mediabunny]').text(),
  ).toContain('Unavailable: unsupported-timeline')
  expect(wrapper.get('[data-test=keyframe-backend-dom]').text()).toContain(
    'DOM · 160 px',
  )
  expect(wrapper.get('[data-test=keyframe-backend-dom]').text()).toContain(
    '1 frames',
  )
  expect(wrapper.text()).toContain('File wall')
  expect(wrapper.text()).not.toContain('Motion unavailable')
  await wrapper.get('[data-test=keyframe-comparison-rail]').setValue('0.5')
  expect(wrapper.findAllComponents(SeekPreviewTooltip)).toHaveLength(1)
  expect(
    wrapper.get<HTMLTextAreaElement>('[data-test=plan-json]').element.value,
  ).not.toMatch(/private.mp4|blob:native/)
  wrapper.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:native-seek')
})
it.each([false, true])(
  'compares fixed-source keyframes at the shared viewport and cleans allocations (URL failure=%s)',
  async (allocationFailure) => {
    let urls = 0
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      if (allocationFailure && urls === 1) throw new Error('allocation')
      return `blob:quality-${++urls}`
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let finish = () => {}
    vi.spyOn(runner, 'runExtractionPlan').mockImplementation(
      async (options) => {
        expect(options.preset).toBe('motion-keyframes-quality-v1')
        options.onClipSample?.(
          {
            file: 1,
            output: {
              clips: [
                {
                  blob: new Blob(['mp4'], { type: 'video/mp4' }),
                  start: 0,
                  duration: 1.5,
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
            id: 'motion',
            pass: 1,
            workload: 'clips',
            execution: 'mediabunny',
            jobs: 1,
            production: true,
            frameRate: 20,
            clipSeconds: 1.5,
          },
        )
        const result = {
          ...report(),
          preset: 'motion-keyframes-quality-v1' as const,
          plannedSteps: planSteps('motion-keyframes-quality-v1'),
        }
        for (const maxWidth of [120, 160, 240] as const) {
          try {
            if (maxWidth === 160) continue // Fixed file failure: must remain missing, not use a different source.
            options.onKeyframeSample?.(
              {
                file: 1,
                duration: 30,
                output: {
                  frames: [
                    new Blob(['first'], { type: 'image/jpeg' }),
                    new Blob(['second'], { type: 'image/jpeg' }),
                  ],
                  width: maxWidth,
                  height: (maxWidth * 9) / 16,
                  readBytes: 1024,
                  readCalls: 1,
                  metrics: emptyMetrics(),
                },
              },
              {
                id: `keys-${maxWidth}`,
                pass: 1,
                workload: 'keyframes',
                execution: 'mediabunny',
                jobs: 1,
                maxWidth,
              },
            )
          } catch {
            result.errors = ['display-failed']
          }
        }
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        return result
      },
    )
    const wrapper = mount(ExtractionPlanPanel, {
      props,
      global: { stubs: { MotionPreview: true } },
    })
    await wrapper
      .get('[data-test=plan-preset]')
      .setValue('motion-keyframes-quality-v1')
    await wrapper.get('[data-test=plan-start]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test=keyframe-comparison]').exists()).toBe(false)
    expect(wrapper.findComponent(MotionPreview).exists()).toBe(false)
    finish()
    await flushPromises()
    if (allocationFailure) {
      expect(wrapper.find('[data-test=keyframe-comparison]').exists()).toBe(
        false,
      )
      expect(wrapper.findComponent(MotionPreview).exists()).toBe(false)
      expect(revoke).toHaveBeenCalledWith('blob:quality-1')
      expect(wrapper.text()).toContain('display-failed')
    } else {
      expect(wrapper.findAllComponents(MotionPreview)).toHaveLength(1)
      expect(wrapper.text()).toContain('video 1')
      expect(wrapper.get('[data-test=keyframe-width-160]').text()).toContain(
        'Unavailable',
      )
      const rail = wrapper.get('[data-test=keyframe-comparison-rail]')
      vi.spyOn(rail.element, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 100,
      } as DOMRect)
      await rail.trigger('pointermove', { clientX: 45 })
      const tooltips = wrapper.findAllComponents(SeekPreviewTooltip)
      expect(tooltips).toHaveLength(2)
      expect(
        tooltips.every((tooltip) =>
          tooltip.element.parentElement?.parentElement?.classList.contains(
            'quality-tooltip-space',
          ),
        ),
      ).toBe(true)
      expect(
        tooltips.every((tooltip) => tooltip.props('seconds') === 13.5),
      ).toBe(true)
      expect(
        tooltips.map((tooltip) => tooltip.get('img').attributes('src')),
      ).toEqual(['blob:quality-2', 'blob:quality-4'])
      await wrapper.setProps({ visible: false })
      expect(wrapper.getComponent(MotionPreview).props('active')).toBe(false)
      await wrapper.setProps({ selectionId: 'other' })
      expect(wrapper.find('[data-test=keyframe-comparison]').exists()).toBe(
        false,
      )
      expect(revoke).toHaveBeenCalledTimes(
        create.mock.results.filter((result) => result.type === 'return').length,
      )
    }
    wrapper.unmount()
  },
)
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
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(runner, 'runExtractionPlan').mockImplementation(
      async (options) => {
        for (const clipSeconds of [0.5, 2] as const) {
          const frameRate = 20
          options.onClipSample?.(
            {
              file: 1,
              output: {
                clips: [
                  {
                    blob: new Blob(['mp4'], { type: 'video/mp4' }),
                    start: 0,
                    duration: clipSeconds,
                  },
                  {
                    blob: new Blob(['mp4-2'], { type: 'video/mp4' }),
                    start: 6,
                    duration: clipSeconds,
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
              id: `duration-${clipSeconds}`,
              pass: 1,
              workload: 'clips',
              execution: 'mediabunny',
              jobs: 1,
              frameRate,
              clipSeconds,
            },
          )
        }
        return report()
      },
    )
    const wrapper = mount(ExtractionPlanPanel, { props })
    expect(
      wrapper.get<HTMLSelectElement>('[data-test=plan-preset]').element.value,
    ).toBe('motion-keyframes-quality-v1')
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
    expect(wrapper.get('[data-test=clip-variant]').text()).toContain(
      '0.5 s · 20 FPS',
    )
    pause.mockClear()
    play.mockClear()
    await wrapper.setProps({ visible: false })
    expect(pause).toHaveBeenCalled()
    expect(video.autoplay).toBe(false)
    await wrapper.get('video').trigger('loadeddata')
    await wrapper.get('video').trigger('ended')
    expect(play).not.toHaveBeenCalled()
    expect(video.src).toContain('blob:clip-1')
    await wrapper.setProps({ visible: true })
    expect(play.mock.calls.length > 0).toBe(!reducedMotion)
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
    expect(wrapper.get('[data-test=clip-samples]').text()).toContain(
      '2 s · 20 FPS',
    )
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
