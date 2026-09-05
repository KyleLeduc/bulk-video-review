import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VideoBenchmarkView from './VideoBenchmarkView.vue'
import * as suiteRunner from './runVideoBenchmarkSuite'
import reference from '../shared/benchmark/referenceFixtures.json'
import type { TrialRow } from './videoBenchmarkHost'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('benchmark operator controls', () => {
  const build = {
    revision: 'a'.repeat(40),
    assetsSha256: 'b'.repeat(64),
    dirty: false,
  }
  async function finishedView(
    status: 'failed' | 'interrupted' = 'interrupted',
  ) {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const suite: suiteRunner.BenchmarkSuite = {
      protocolVersion: 2,
      mode: 'pipeline-custom-files-v1',
      status,
      cleanup: 'complete',
      settings: {
        configurations: [{ backend: 'dom', foreground: 2, previews: 1 }],
        repetitions: 1,
        includeCached: true,
      },
      fixture: {
        kind: 'custom',
        id: '12345678-1234-4123-8123-123456789abc',
        files: [4],
        verification: 'selection-only',
      },
      identity: { build, userAgent: 'test', cacheScope: 'fresh pair database' },
      limits: { startupMs: 15000, trialMs: 120000, cleanupMs: 10000 },
      rows: [],
      errors: status === 'failed' ? ['Trial startup failed'] : [],
      orphanedPairs: [],
    }
    vi.spyOn(suiteRunner, 'runVideoBenchmarkSuite').mockResolvedValue(suite)
    const wrapper = mount(VideoBenchmarkView, {
      props: { build, capable: true },
    })
    await wrapper.get('[data-test=input-mode]').setValue('custom')
    const input = wrapper.get<HTMLInputElement>('[data-test=fixture-files]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['clip'], 'personal.mp4')],
      configurable: true,
    })
    await input.trigger('change')
    await wrapper.get('[data-test=start]').trigger('click')
    await flushPromises()
    return { wrapper, suite, input }
  }

  test.each(['failed', 'interrupted'] as const)(
    'copies exact %s evidence without changing its status',
    async (status) => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const { wrapper, suite } = await finishedView(status)
      const text = wrapper.get<HTMLTextAreaElement>('[data-test=result-json]')
        .element.value
      await wrapper.get('[data-test=copy-json]').trigger('click')
      await flushPromises()
      expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
      expect(JSON.parse(text)).toEqual(suite)
      expect(wrapper.get('[data-test=copy-status]').text()).toContain(
        'JSON copied',
      )
      expect(wrapper.get('[data-test=suite-status]').text()).toContain(status)
      await wrapper.get('[data-test=input-mode]').setValue('reference')
      expect(wrapper.find('[data-test=copy-status]').exists()).toBe(false)
      expect(
        wrapper.get('[data-test=copy-json]').attributes('disabled'),
      ).toBeDefined()
      wrapper.unmount()
    },
  )

  test.each(['unavailable', 'denied'])(
    'opens and selects the existing JSON when clipboard is %s',
    async (scenario) => {
      const writeText = vi.fn(async () => {
        throw new Error('Permission denied')
      })
      vi.stubGlobal('navigator', {
        clipboard: scenario === 'denied' ? { writeText } : undefined,
      })
      const { wrapper } = await finishedView()
      const textarea = wrapper.get<HTMLTextAreaElement>(
        '[data-test=result-json]',
      )
      const focus = vi.spyOn(textarea.element, 'focus')
      const select = vi.spyOn(textarea.element, 'select')
      await wrapper.get('[data-test=copy-json]').trigger('click')
      await flushPromises()
      expect(textarea.element.closest('details')?.open).toBe(true)
      expect(focus).toHaveBeenCalled()
      expect(select).toHaveBeenCalled()
      expect(wrapper.get('[data-test=copy-status]').text()).toContain('Ctrl+C')
      expect(wrapper.get('[data-test=suite-status]').text()).toContain(
        'interrupted',
      )
      wrapper.unmount()
    },
  )

  test.each([false, true])(
    'ignores stale clipboard completion after selecting a new workload (reject: %s)',
    async (reject) => {
      let settle!: () => void
      const pending = new Promise<void>((resolve, fail) => {
        settle = () => (reject ? fail(new Error('denied')) : resolve())
      })
      vi.stubGlobal('navigator', {
        clipboard: { writeText: vi.fn(() => pending) },
      })
      const { wrapper, input } = await finishedView()
      await wrapper.get('[data-test=copy-json]').trigger('click')
      expect(
        wrapper.get('[data-test=copy-json]').attributes('disabled'),
      ).toBeDefined()
      await input.trigger('change')
      settle()
      await flushPromises()
      expect(wrapper.find('[data-test=copy-status]').exists()).toBe(false)
      expect(wrapper.find('[data-test=result-json]').exists()).toBe(false)
      wrapper.unmount()
    },
  )
  test.each([false, true])(
    'retains redacted reference/custom progress before settlement (%s)',
    async (custom) => {
      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
        'probably',
      )
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const row = {
        configuration: {
          backend: 'dom',
          foreground: 2,
          previews: 1,
          repetition: 1,
          cache: 'cold',
        },
        wallMs: 10,
        errors: [],
        report: { measurements: { foreground: { seek: { totalMs: 25 } } } },
      } as unknown as TrialRow
      vi.spyOn(suiteRunner, 'runVideoBenchmarkSuite').mockImplementation(
        async (options) => {
          options.onRow?.(row)
          await gate
          throw new Error('Interrupted fixture')
        },
      )
      const wrapper = mount(VideoBenchmarkView, {
        props: { build, capable: true },
      })
      if (custom) await wrapper.get('[data-test=input-mode]').setValue('custom')
      const files = custom
        ? [new File(['clip'], 'private-workload.mp4')]
        : reference.files.map((item) => {
            const file = new File([], item.path.split('/').pop()!)
            Object.defineProperties(file, {
              size: { value: item.bytes },
              webkitRelativePath: { value: item.path },
            })
            return file
          })
      const input = wrapper.get('input[type=file]')
      Object.defineProperty(input.element, 'files', {
        value: files,
        configurable: true,
      })
      await input.trigger('change')
      if (custom) {
        expect(input.attributes('webkitdirectory')).toBeUndefined()
        expect(wrapper.text()).toContain('Custom files')
      }
      await wrapper.get('[data-test=start]').trigger('click')
      expect(wrapper.get('[data-test=suite-status]').text()).toContain(
        'running',
      )
      expect(
        wrapper.get('[data-test=copy-json]').attributes('disabled'),
      ).toBeDefined()
      expect(
        JSON.parse(
          (
            wrapper.get('[data-test=progress-json]')
              .element as HTMLTextAreaElement
          ).value,
        ),
      ).toEqual([row])
      expect(wrapper.text()).toContain('foreground / seek: 0.025 s')
      release()
      await flushPromises()
      expect(wrapper.text()).toContain('Interrupted fixture')
      // Reselecting in the same mode must not leave evidence for the old workload.
      Object.defineProperty(input.element, 'files', {
        value: files.slice(0, 1),
      })
      await input.trigger('change')
      expect(wrapper.text()).not.toContain('Interrupted fixture')
      expect(
        JSON.parse(
          (
            wrapper.get('[data-test=progress-json]')
              .element as HTMLTextAreaElement
          ).value,
        ),
      ).toEqual([])
      wrapper.unmount()
    },
  )
  test('clears a custom selection when returning to the guarded reference mode', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
      'probably',
    )
    const wrapper = mount(VideoBenchmarkView, {
      props: { build, capable: true },
    })
    await wrapper.get('[data-test=input-mode]').setValue('custom')
    const input = wrapper.get('[data-test=fixture-files]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['clip'], 'personal.mp4')],
    })
    await input.trigger('change')
    expect(
      wrapper.get('[data-test=start]').attributes('disabled'),
    ).toBeUndefined()
    await wrapper.get('[data-test=input-mode]').setValue('reference')
    expect(
      wrapper.get('[data-test=start]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test=copy-json]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('not a browser or OS cache reset')
    expect(
      wrapper.get('[data-test=fixture-files]').attributes('webkitdirectory'),
    ).toBeDefined()
    wrapper.unmount()
  })
  test('starts unavailable without fixtures and labels real backend, verification and missing metrics', () => {
    const wrapper = mount(VideoBenchmarkView, {
      props: { build, capable: true },
    })
    expect(
      wrapper.get('[data-test=start]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('selection-only')
    expect(wrapper.text()).toContain('WebCodecs: not implemented')
    expect(wrapper.text()).toContain('unavailable')
    expect(wrapper.get('[data-test=repetitions]').attributes('max')).toBe('5')
    expect(wrapper.get('[data-test=stop]').text()).toBe(
      'Stop after current trial',
    )
    wrapper.unmount()
  })
  test('reports missing capabilities and never enables Start for an invalid selection', async () => {
    const wrapper = mount(VideoBenchmarkView, {
      props: { build, capable: false },
    })
    expect(wrapper.text()).toContain('Chrome or Edge')
    const input = wrapper.get('input[type=file]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['bad'], 'unexpected.mp4')],
    })
    await input.trigger('change')
    expect(
      wrapper
        .findAll('[role=alert]')
        .some((alert) => alert.text().includes('fixture')),
    ).toBe(true)
    expect(
      wrapper.get('[data-test=start]').attributes('disabled'),
    ).toBeDefined()
    wrapper.unmount()
  })
})
