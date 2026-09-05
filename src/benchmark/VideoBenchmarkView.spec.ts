import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import VideoBenchmarkView from './VideoBenchmarkView.vue'

describe('benchmark operator controls', () => {
  const build = {
    revision: 'a'.repeat(40),
    assetsSha256: 'b'.repeat(64),
    dirty: false,
  }
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
