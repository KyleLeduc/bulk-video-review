import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import SelectDropdown from './SelectDropdown.vue'

describe('SelectDropdown', () => {
  test('renders a labeled native select with every numeric option and emits the selected number', async () => {
    const wrapper = mount(SelectDropdown, {
      props: {
        label: 'Columns',
        selectId: 'column-count',
        selected: 3,
        options: [
          { label: '2 columns', value: 2 },
          { label: '3 columns', value: 3 },
        ],
      },
    })

    const select = wrapper.get('select')
    const label = wrapper.get('label')

    expect(select.attributes('id')).toBe('column-count')
    expect(label.attributes('for')).toBe('column-count')
    expect((select.element as HTMLSelectElement).value).toBe('3')
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      '2 columns',
      '3 columns',
    ])

    await select.setValue('2')

    expect(wrapper.emitted('select')).toEqual([[2]])
  })

  test('uses the default select ID and preserves string option values', async () => {
    const wrapper = mount(SelectDropdown, {
      props: {
        selected: 'all',
        options: [
          { label: 'All videos', value: 'all' },
          { label: 'Needs review', value: 'needs-review' },
        ],
      },
    })

    const select = wrapper.get('select')

    expect(wrapper.find('label').exists()).toBe(false)
    expect(select.attributes('id')).toBe('column-select')
    expect((select.element as HTMLSelectElement).value).toBe('all')
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'All videos',
      'Needs review',
    ])

    await select.setValue('needs-review')

    expect(wrapper.emitted('select')).toEqual([['needs-review']])
  })
})
