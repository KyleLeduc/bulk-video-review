import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAppStateStore } from '@presentation/stores'
import { createPresentationTestContext } from '@test-utils/index'
import NavBar from './NavBar.vue'

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('NavBar', () => {
  test('exposes the filter panel relationship and expanded state on its toggle', async () => {
    const context = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })
    const wrapper = mount(NavBar, {
      global: context.global,
      shallow: true,
    })
    const appStateStore = useAppStateStore(context.pinia)
    const toggle = wrapper.get('#filter-panel-navigation-toggle')

    expect(toggle.attributes('type')).toBe('button')
    expect(toggle.attributes('aria-controls')).toBe('video-filter-panel')
    expect(toggle.attributes('aria-expanded')).toBe('true')

    await toggle.trigger('click')

    expect(appStateStore.isFilterPanelOpen).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  test('renders an explicit sticky shell element for the top navigation', () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(NavBar, {
      global,
      shallow: true,
    })

    expect(wrapper.find('.nav-shell').exists()).toBe(true)
  })

  test('renders the title through the dedicated NavTitle component', () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(NavBar, {
      global,
      shallow: true,
    })

    expect(wrapper.findComponent({ name: 'NavTitle' }).exists()).toBe(true)
    expect(wrapper.find('.nav-left > h1').exists()).toBe(false)
  })

  test('stays hidden through a small upward bounce and returns on sustained upward scroll', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    setScrollY(0)
    const wrapper = mount(NavBar, {
      global,
      shallow: true,
    })

    const nav = wrapper.get('.nav-shell')
    expect(nav.classes()).not.toContain('nav-shell--hidden')

    setScrollY(160)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(nav.classes()).toContain('nav-shell--hidden')

    setScrollY(150)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(nav.classes()).toContain('nav-shell--hidden')

    setScrollY(48)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(nav.classes()).not.toContain('nav-shell--hidden')
  })
})
