import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CustomExtractionBenchmark from './CustomExtractionBenchmark.vue'
import * as runner from './runExtractionBenchmark'
import { emptyMetrics } from '../infrastructure/video/benchmark/previewExtraction'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('groups automatic plans before collapsed manual settings with independent validation', async () => {
  const wrapper = mount(CustomExtractionBenchmark, {
    props: {
      build: { revision: null, dirty: null, assetsSha256: null },
      capable: true,
    },
  })
  const manual = wrapper.get('details[data-test=manual-extraction]')
  expect(manual.attributes('open')).toBeUndefined()
  expect(manual.find('[data-test=extraction-repetitions]').exists()).toBe(true)
  expect(manual.find('[data-test=extraction-start]').exists()).toBe(true)
  expect(manual.find('[data-test=plan-start]').exists()).toBe(false)
  expect(manual.find('[data-test=extraction-files]').exists()).toBe(false)
  const picker = wrapper.get<HTMLInputElement>('[data-test=extraction-files]')
  Object.defineProperty(picker.element, 'files', {
    value: [new File(['x'], 'private.mp4')],
  })
  await picker.trigger('change')
  await wrapper.get('[data-test=memory-ack]').setValue(true)
  await wrapper.get('[data-test=extraction-repetitions]').setValue(0)
  expect(
    wrapper.get('[data-test=extraction-start]').attributes('disabled'),
  ).toBeDefined()
  expect(
    wrapper.get('[data-test=plan-start]').attributes('disabled'),
  ).toBeUndefined()
  expect(wrapper.html().indexOf('plan-heading')).toBeLessThan(
    wrapper.html().indexOf('manual-extraction'),
  )
  wrapper.unmount()
})
it('keeps the visible table in launch order when concurrent jobs finish out of order', async () => {
  vi.spyOn(runner, 'runExtractionBenchmark').mockImplementation((options) => {
    for (const order of [2, 1])
      options.onRow?.({
        file: order,
        repetition: 1,
        order,
        backend: 'dom',
        status: 'passed',
        reason: null,
        wallMs: 1,
        frames: 9,
        outputBytes: 9,
        readBytes: null,
        readCalls: null,
        startedAtMs: 0,
        finishedAtMs: 1,
        metrics: emptyMetrics(),
      })
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
  expect(
    wrapper.findAll('tbody tr').map((row) => row.findAll('td')[1].text()),
  ).toEqual(['1', '2'])
  wrapper.unmount()
})
it('requires custom files and memory acknowledgement, and copies redacted results', async () => {
  const build = { revision: null, dirty: null, assetsSha256: null }
  const report: runner.ExtractionReport = {
    errors: [],
    schemaVersion: 4,
    mode: 'preview-extraction-custom-v1',
    status: 'completed',
    hidden: false,
    selection: { id: 'selection', sizes: [4], verification: 'selection-only' },
    identity: { build, userAgent: 'test', cacheScope: 'shared' },
    settings: {
      repetitions: 1,
      jobs: 1,
      execution: 'paired',
      samples: 'after-run',
      readerMode: 'direct',
      candidate: 'mediabunny@1.55.7',
      deadlineMs: 120000,
      previewCount: 9,
      samplingPolicy: 'integer-deciles',
      maxReadBytes: 256 * 1024 * 1024,
      maxOutputBytes: 16 * 1024 * 1024,
    },
    preparation: [],
    rows: [],
    batches: [],
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
  await wrapper.get('[data-test=extraction-execution]').setValue('mediabunny')
  await wrapper.get('[data-test=extraction-jobs]').setValue('4')
  await wrapper.get('[data-test=extraction-count]').setValue('100')
  await wrapper.get('[data-test=extraction-reader]').setValue('buffered-1mib')
  await wrapper.get('[data-test=extraction-start]').trigger('click')
  await flushPromises()
  expect(run.mock.calls[0][0].files).toEqual([file])
  expect(run.mock.calls[0][0]).toMatchObject({
    execution: 'mediabunny',
    jobs: 4,
    previewCount: 100,
    readerMode: 'buffered-1mib',
  })
  await wrapper.get('[data-test=extraction-execution]').setValue('paired')
  expect(
    wrapper.get('[data-test=extraction-jobs]').attributes('disabled'),
  ).toBeDefined()
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
      options.onSamples?.([
        {
          row: {
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
            startedAtMs: 0,
            finishedAtMs: 1,
            metrics: emptyMetrics(),
          },
          output: {
            metrics: emptyMetrics(),
            frames: Array(9).fill(new Blob(['jpeg'], { type: 'image/jpeg' })),
            width: 160,
            height: 90,
            readBytes: null,
            readCalls: null,
          },
        },
      ])
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
