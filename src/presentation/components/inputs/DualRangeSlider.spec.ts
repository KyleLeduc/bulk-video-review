import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'

import DualRangeSlider from './DualRangeSlider.vue'

const mountSlider = (
  overrides: Partial<InstanceType<typeof DualRangeSlider>['$props']> = {},
) =>
  mount(DualRangeSlider, {
    props: {
      idPrefix: 'duration-filter',
      label: 'Duration',
      minimum: 0,
      maximum: 12,
      lowerValue: 2,
      upperValue: 10,
      step: 1,
      formatValue: (value: number, edge: 'lower' | 'upper') =>
        edge === 'upper' ? `${value}+ min` : `${value} min`,
      ...overrides,
    },
  })

describe('DualRangeSlider', () => {
  test('renders formatted values, selected geometry, and distinct slider semantics', () => {
    const wrapper = mountSlider()
    const lowerHandle = wrapper.get('[data-range-handle="lower"]')
    const upperHandle = wrapper.get('[data-range-handle="upper"]')
    const selection = wrapper.get('.dual-range__selection')

    expect(wrapper.get('legend').text()).toBe('Duration')
    expect(wrapper.get('[data-range-value="lower"]').text()).toBe('2 min')
    expect(wrapper.get('[data-range-value="upper"]').text()).toBe('10+ min')
    expect((selection.element as HTMLElement).style.left).toBe(
      '16.666666666666664%',
    )
    expect(
      Number.parseFloat((selection.element as HTMLElement).style.width),
    ).toBeCloseTo(66.66666666666667)

    expect(lowerHandle.attributes()).toMatchObject({
      id: 'duration-filter-lower',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Duration minimum',
      'aria-valuemin': '0',
      'aria-valuemax': '10',
      'aria-valuenow': '2',
      'aria-valuetext': '2 min',
    })
    expect(upperHandle.attributes()).toMatchObject({
      id: 'duration-filter-upper',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Duration maximum',
      'aria-valuemin': '2',
      'aria-valuemax': '12',
      'aria-valuenow': '10',
      'aria-valuetext': '10+ min',
    })
  })

  test.each([
    ['lower', 'ArrowRight', 3],
    ['lower', 'ArrowUp', 3],
    ['lower', 'ArrowLeft', 1],
    ['lower', 'ArrowDown', 1],
    ['lower', 'PageUp', 7],
    ['lower', 'PageDown', 0],
    ['lower', 'Home', 0],
    ['lower', 'End', 10],
    ['upper', 'ArrowRight', 11],
    ['upper', 'ArrowUp', 11],
    ['upper', 'ArrowLeft', 9],
    ['upper', 'ArrowDown', 9],
    ['upper', 'PageUp', 12],
    ['upper', 'PageDown', 5],
    ['upper', 'Home', 2],
    ['upper', 'End', 12],
  ] as const)(
    'moves the %s handle for %s without changing its role',
    async (handle, key, expected) => {
      const wrapper = mountSlider()

      await wrapper.get(`[data-range-handle="${handle}"]`).trigger('keydown', {
        key,
      })

      expect(wrapper.emitted(`update:${handle}Value`)).toEqual([[expected]])
      expect(
        wrapper.emitted(
          `update:${handle === 'lower' ? 'upper' : 'lower'}Value`,
        ),
      ).toBeUndefined()
    },
  )

  test('stops each keyboard-controlled handle at the other handle', async () => {
    const lowerWrapper = mountSlider({ lowerValue: 9, upperValue: 10 })
    const lowerHandle = lowerWrapper.get('[data-range-handle="lower"]')

    await lowerHandle.trigger('keydown', { key: 'PageUp' })
    expect(lowerWrapper.emitted('update:lowerValue')).toEqual([[10]])

    await lowerWrapper.setProps({ lowerValue: 10 })
    await lowerHandle.trigger('keydown', { key: 'ArrowRight' })
    expect(lowerWrapper.emitted('update:lowerValue')).toEqual([[10]])

    const upperWrapper = mountSlider({ lowerValue: 9, upperValue: 10 })
    const upperHandle = upperWrapper.get('[data-range-handle="upper"]')

    await upperHandle.trigger('keydown', { key: 'PageDown' })
    expect(upperWrapper.emitted('update:upperValue')).toEqual([[9]])

    await upperWrapper.setProps({ upperValue: 9 })
    await upperHandle.trigger('keydown', { key: 'ArrowLeft' })
    expect(upperWrapper.emitted('update:upperValue')).toEqual([[9]])
  })

  test('disables a zero-width range', async () => {
    const wrapper = mountSlider({
      maximum: 0,
      lowerValue: 0,
      upperValue: 0,
    })
    const handles = wrapper.findAll('[role="slider"]')

    expect(wrapper.get('[data-range-value="lower"]').text()).toBe('0 min')
    expect(wrapper.get('[data-range-value="upper"]').text()).toBe('0+ min')
    expect(handles).toHaveLength(2)

    for (const handle of handles) {
      expect(handle.attributes('tabindex')).toBe('-1')
      expect(handle.attributes('aria-disabled')).toBe('true')
      await handle.trigger('keydown', { key: 'ArrowRight' })
    }

    expect(wrapper.emitted('update:lowerValue')).toBeUndefined()
    expect(wrapper.emitted('update:upperValue')).toBeUndefined()
  })

  test('captures pointer dragging and rounds track positions to the nearest step', async () => {
    const wrapper = mountSlider()
    const track = wrapper.get('.dual-range__track')
    const lowerHandle = wrapper.get('[data-range-handle="lower"]')
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    vi.spyOn(track.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 0,
      bottom: 32,
      width: 240,
      height: 32,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })
    Object.assign(lowerHandle.element, {
      setPointerCapture,
      releasePointerCapture,
    })

    await lowerHandle.trigger('pointermove', { clientX: 230, pointerId: 7 })
    expect(wrapper.emitted('update:lowerValue')).toBeUndefined()

    await lowerHandle.trigger('pointerdown', { clientX: 140, pointerId: 7 })
    await lowerHandle.trigger('pointermove', { clientX: 230, pointerId: 7 })
    await lowerHandle.trigger('pointerup', { clientX: 230, pointerId: 7 })

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('update:lowerValue')).toEqual([[7]])
  })

  test('clamps pointer dragging at the opposite handle', async () => {
    const lowerWrapper = mountSlider({ lowerValue: 2, upperValue: 3 })
    const lowerTrack = lowerWrapper.get('.dual-range__track')
    const lowerHandle = lowerWrapper.get('[data-range-handle="lower"]')
    vi.spyOn(lowerTrack.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 0,
      bottom: 32,
      width: 240,
      height: 32,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })

    await lowerHandle.trigger('pointerdown', { clientX: 140, pointerId: 1 })
    await lowerHandle.trigger('pointermove', { clientX: 340, pointerId: 1 })
    await lowerHandle.trigger('pointerup', { clientX: 340, pointerId: 1 })

    expect(lowerWrapper.emitted('update:lowerValue')).toEqual([[3]])

    await lowerWrapper.setProps({ lowerValue: 3 })
    await lowerHandle.trigger('pointerdown', { clientX: 340, pointerId: 2 })
    await lowerHandle.trigger('pointermove', { clientX: 340, pointerId: 2 })
    await lowerHandle.trigger('pointerup', { clientX: 340, pointerId: 2 })

    expect(lowerWrapper.emitted('update:lowerValue')).toEqual([[3]])

    const upperWrapper = mountSlider({ lowerValue: 2, upperValue: 3 })
    const upperTrack = upperWrapper.get('.dual-range__track')
    const upperHandle = upperWrapper.get('[data-range-handle="upper"]')
    vi.spyOn(upperTrack.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 0,
      bottom: 32,
      width: 240,
      height: 32,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })

    await upperHandle.trigger('pointerdown', { clientX: 160, pointerId: 3 })
    await upperHandle.trigger('pointermove', { clientX: 100, pointerId: 3 })
    await upperHandle.trigger('pointerup', { clientX: 100, pointerId: 3 })

    expect(upperWrapper.emitted('update:upperValue')).toEqual([[2]])

    await upperWrapper.setProps({ upperValue: 2 })
    await upperHandle.trigger('pointerdown', { clientX: 100, pointerId: 4 })
    await upperHandle.trigger('pointermove', { clientX: 100, pointerId: 4 })
    await upperHandle.trigger('pointerup', { clientX: 100, pointerId: 4 })

    expect(upperWrapper.emitted('update:upperValue')).toEqual([[2]])
  })

  test('keeps both pointer roles operable and focused when handles overlap', async () => {
    const wrapper = mountSlider({ lowerValue: 10, upperValue: 10 })
    document.body.appendChild(wrapper.element)
    const track = wrapper.get('.dual-range__track')
    const lowerHandle = wrapper.get('[data-range-handle="lower"]')
    const upperHandle = wrapper.get('[data-range-handle="upper"]')
    vi.spyOn(track.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 0,
      bottom: 32,
      width: 240,
      height: 32,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })

    try {
      await upperHandle.trigger('pointerdown', { clientX: 295, pointerId: 5 })
      expect(document.activeElement).toBe(lowerHandle.element)
      await upperHandle.trigger('pointermove', { clientX: 280, pointerId: 5 })
      await upperHandle.trigger('pointerup', { clientX: 280, pointerId: 5 })

      expect(wrapper.emitted('update:lowerValue')).toEqual([[9]])
      expect(wrapper.emitted('update:upperValue')).toBeUndefined()

      await wrapper.setProps({ lowerValue: 10, upperValue: 10 })
      await upperHandle.trigger('pointerdown', { clientX: 305, pointerId: 6 })
      expect(document.activeElement).toBe(upperHandle.element)
      await upperHandle.trigger('pointermove', { clientX: 320, pointerId: 6 })
      await upperHandle.trigger('pointerup', { clientX: 320, pointerId: 6 })

      expect(wrapper.emitted('update:upperValue')).toEqual([[11]])

      await wrapper.setProps({ lowerValue: 12, upperValue: 12 })
      await upperHandle.trigger('pointerdown', { clientX: 340, pointerId: 7 })
      await upperHandle.trigger('pointermove', { clientX: 320, pointerId: 7 })
      await upperHandle.trigger('pointerup', { clientX: 320, pointerId: 7 })

      expect(wrapper.emitted('update:lowerValue')).toEqual([[9], [11]])

      await wrapper.setProps({ lowerValue: 0, upperValue: 0 })
      await upperHandle.trigger('pointerdown', { clientX: 100, pointerId: 8 })
      await upperHandle.trigger('pointermove', { clientX: 120, pointerId: 8 })
      await upperHandle.trigger('pointerup', { clientX: 120, pointerId: 8 })

      expect(wrapper.emitted('update:upperValue')).toEqual([[11], [1]])
    } finally {
      wrapper.unmount()
    }
  })

  test('selects the nearest pointer role when adjacent handles overlap', async () => {
    const wrapper = mountSlider({
      maximum: 60,
      lowerValue: 30,
      upperValue: 31,
    })
    document.body.appendChild(wrapper.element)
    const track = wrapper.get('.dual-range__track')
    const lowerHandle = wrapper.get('[data-range-handle="lower"]')
    const upperHandle = wrapper.get('[data-range-handle="upper"]')
    vi.spyOn(track.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 0,
      bottom: 32,
      width: 240,
      height: 32,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })

    try {
      await upperHandle.trigger('pointerdown', { clientX: 221, pointerId: 9 })
      expect(document.activeElement).toBe(lowerHandle.element)
      await upperHandle.trigger('pointermove', { clientX: 216, pointerId: 9 })
      await upperHandle.trigger('pointerup', { clientX: 216, pointerId: 9 })

      expect(wrapper.emitted('update:lowerValue')).toEqual([[29]])
      expect(wrapper.emitted('update:upperValue')).toBeUndefined()

      await wrapper.setProps({ lowerValue: 30, upperValue: 31 })
      await lowerHandle.trigger('pointerdown', { clientX: 223, pointerId: 10 })
      expect(document.activeElement).toBe(upperHandle.element)
      await lowerHandle.trigger('pointermove', { clientX: 228, pointerId: 10 })
      await lowerHandle.trigger('pointerup', { clientX: 228, pointerId: 10 })

      expect(wrapper.emitted('update:upperValue')).toEqual([[32]])
    } finally {
      wrapper.unmount()
    }
  })
})
