import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VideoBenchmarkView from './VideoBenchmarkView.vue'
import * as suiteRunner from './runVideoBenchmarkSuite'
import reference from '../shared/benchmark/referenceFixtures.json'
import type { TrialRow } from './videoBenchmarkHost'

afterEach(() => vi.restoreAllMocks())

describe('benchmark operator controls', () => {
  const build = {
    revision: 'a'.repeat(40),
    assetsSha256: 'b'.repeat(64),
    dirty: false,
  }
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
