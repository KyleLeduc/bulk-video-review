import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
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

  test('hides on downward scroll and returns when scrolling back up', async () => {
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

    setScrollY(48)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(nav.classes()).not.toContain('nav-shell--hidden')
  })
})
