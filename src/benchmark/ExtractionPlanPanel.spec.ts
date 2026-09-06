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
it('renders muted looping clips without autoplay and revokes URLs when selection changes', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(runner, 'runExtractionPlan').mockImplementation(async (options) => {
    options.onClipSample?.({
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
    })
    return report()
  })
  const wrapper = mount(ExtractionPlanPanel, { props })
  await wrapper.get('[data-test=plan-preset]').setValue('clips-3s-v1')
  await wrapper.get('[data-test=plan-start]').trigger('click')
  await flushPromises()
  const video = wrapper.get<HTMLVideoElement>('video').element
  expect(video.loop).toBe(true)
  expect(video.muted).toBe(true)
  expect(video.autoplay).toBe(false)
  expect(
    wrapper.get<HTMLTextAreaElement>('[data-test=plan-json]').element.value,
  ).not.toContain('blob:')
  await wrapper.setProps({ selectionId: 'new-selection' })
  expect(revoke).toHaveBeenCalledWith('blob:clip')
  expect(wrapper.find('video').exists()).toBe(false)
  wrapper.unmount()
})
