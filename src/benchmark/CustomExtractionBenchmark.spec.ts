import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CustomExtractionBenchmark from './CustomExtractionBenchmark.vue'
import * as runner from './runExtractionBenchmark'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('requires custom files and memory acknowledgement, and copies redacted results', async () => {
  const build = { revision: null, dirty: null, assetsSha256: null }
  const report: runner.ExtractionReport = {
    errors: [],
    schemaVersion: 1,
    mode: 'preview-extraction-custom-v1',
    status: 'completed',
    hidden: false,
    selection: { id: 'selection', sizes: [4], verification: 'selection-only' },
    identity: { build, userAgent: 'test', cacheScope: 'shared' },
    settings: {
      repetitions: 1,
      jobs: 1,
      candidate: 'mediabunny@1.55.7',
      deadlineMs: 120000,
    },
    preparation: [],
    rows: [],
  }
  const run = vi
    .spyOn(runner, 'runExtractionBenchmark')
    .mockResolvedValue(report)
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const wrapper = mount(CustomExtractionBenchmark, {
    props: { build, capable: true },
  })
  expect(
    wrapper.get('[data-test=extraction-start]').attributes('disabled'),
  ).toBeDefined()
  const picker = wrapper.get<HTMLInputElement>('[data-test=extraction-files]')
  const file = new File(['clip'], 'secret.mp4')
  Object.defineProperty(picker.element, 'files', { value: [file] })
  await picker.trigger('change')
  expect(
    wrapper.get('[data-test=extraction-start]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.get('[data-test=memory-ack]').setValue(true)
  await wrapper.get('[data-test=extraction-start]').trigger('click')
  await flushPromises()
  expect(run.mock.calls[0][0].files).toEqual([file])
  expect(wrapper.text()).not.toContain('secret.mp4')
  await wrapper.get('[data-test=extraction-copy]').trigger('click')
  expect(writeText).toHaveBeenCalledWith(JSON.stringify(report, null, 2))
  expect(wrapper.emitted('active')).toEqual([[true], [false]])
  let finishCopy: (() => void) | undefined
  writeText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve
      }),
  )
  await wrapper.get('[data-test=extraction-copy]').trigger('click')
  await picker.trigger('change')
  finishCopy?.()
  await flushPromises()
  expect(wrapper.text()).not.toContain('JSON copied')
  wrapper.unmount()
})
it.each([false, true])(
  'releases sample URLs on unmount or partial display failure (%s)',
  async (failDisplay) => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let created = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      if (failDisplay && created++ === 1) throw new Error('display unavailable')
      return 'blob:sample'
    })
    let signal: AbortSignal | undefined
    vi.spyOn(runner, 'runExtractionBenchmark').mockImplementation((options) => {
      signal = options.signal
      options.onRow?.(
        {
          backend: 'dom',
          file: 1,
          repetition: 1,
          order: 1,
          status: 'passed',
          reason: null,
          wallMs: 1,
          frames: 9,
          outputBytes: 9,
          readBytes: null,
          readCalls: null,
        },
        {
          frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
          width: 160,
          height: 90,
          readBytes: null,
          readCalls: null,
        },
      )
      return new Promise(() => {})
    })
    const wrapper = mount(CustomExtractionBenchmark, {
      props: {
        build: { revision: null, dirty: null, assetsSha256: null },
        capable: true,
      },
    })
    const picker = wrapper.get<HTMLInputElement>('[data-test=extraction-files]')
    Object.defineProperty(picker.element, 'files', {
      value: [new File(['x'], 'private.mp4')],
    })
    await picker.trigger('change')
    await wrapper.get('[data-test=memory-ack]').setValue(true)
    await wrapper.get('[data-test=extraction-start]').trigger('click')
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
    expect(revoke).toHaveBeenCalledWith('blob:sample')
  },
)
