import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { createPresentationTestContext } from '@test-utils/index'
import FilterPanel from './FilterPanel.vue'

describe('FilterPanel', () => {
  test('renders the controls directly inside the viewport panel container', () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FilterPanel, {
      global,
    })

    expect(wrapper.find('.filter-panel__surface').exists()).toBe(false)
    expect(wrapper.find('.filter-panel__header').exists()).toBe(true)
    expect(wrapper.find('.filter-panel__content').exists()).toBe(true)
  })
})
