import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, test } from 'vitest'
import { createFilterVideosUseCase } from '@app/usecases'
import {
  useAppStateStore,
  useVideoFilterStore,
  useVideoStore,
} from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import DualRangeSlider from '../inputs/DualRangeSlider.vue'
import FilterPanel from './FilterPanel.vue'
import NavBar from '../../views/NavBar.vue'

const mountPanel = () => {
  const context = createPresentationTestContext({
    useCases: {
      filterVideosUseCase: createFilterVideosUseCase(),
    },
  })
  const wrapper = mount(FilterPanel, { global: context.global })

  return {
    wrapper,
    filterStore: useVideoFilterStore(context.pinia),
    videoStore: useVideoStore(context.pinia),
    appStateStore: useAppStateStore(context.pinia),
  }
}

const seedVideos = (videoStore: ReturnType<typeof useVideoStore>) => {
  videoStore.addVideos([
    buildParsedVideo({
      id: 'alpha',
      title: 'Alpha briefing',
      tags: ['onboarding'],
      duration: 90,
      votes: 5,
      thumbUrls: ['alpha-1', 'alpha-2'],
    }),
    buildParsedVideo({
      id: 'pinned',
      title: 'Pinned reference',
      tags: ['reference'],
      duration: 240,
      votes: 2,
      pinned: true,
      thumbUrls: [],
    }),
    buildParsedVideo({
      id: 'gamma',
      title: 'Gamma demo',
      tags: ['showcase'],
      duration: 60 * 60 + 1,
      votes: -2,
      thumbUrls: ['gamma-1'],
    }),
  ])
}

const getRangeSlider = (
  wrapper: ReturnType<typeof mountPanel>['wrapper'],
  idPrefix: string,
) => {
  const slider = wrapper
    .findAllComponents(DualRangeSlider)
    .find((candidate) => candidate.props('idPrefix') === idPrefix)

  if (!slider) {
    throw new Error(`Missing ${idPrefix} range slider`)
  }

  return slider
}

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('FilterPanel', () => {
  test('keeps the direct panel structure and exposes live result and active-filter feedback', async () => {
    const { wrapper, videoStore } = mountPanel()
    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('Clear filters'))

    expect(wrapper.find('.filter-panel__surface').exists()).toBe(false)
    expect(wrapper.find('.filter-panel__header').exists()).toBe(true)
    expect(wrapper.find('.filter-panel__content').exists()).toBe(true)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 0 of 0 videos',
    )
    expect(clearButton?.attributes('type')).toBe('button')
    expect(clearButton?.attributes('disabled')).toBeDefined()
    expect(clearButton?.text()).toBe('Clear filters')

    seedVideos(videoStore)
    await nextTick()

    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 3 of 3 videos',
    )

    await wrapper.get('#video-filter-search').setValue('onboarding')

    expect(clearButton?.attributes('disabled')).toBeUndefined()
    expect(clearButton?.text()).toBe('Clear filters (1)')
  })

  test('searches titles or tags and changes pinned handling through labeled native controls', async () => {
    const { wrapper, filterStore, videoStore } = mountPanel()
    seedVideos(videoStore)
    await nextTick()

    const search = wrapper.get('#video-filter-search')
    const pinned = wrapper.get('#pinned-videos-filter')

    expect(wrapper.get('label[for="video-filter-search"]').text()).toBe(
      'Search title or tag',
    )

    await search.setValue('onboarding')

    expect(filterStore.filters.searchQuery).toBe('onboarding')
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 2 of 3 videos',
    )
    expect(
      pinned.findAll('option').map((option) => option.attributes('value')),
    ).toEqual(['keep-visible', 'match', 'only', 'hide'])

    await pinned.setValue('match')

    expect(filterStore.filters.pinnedMode).toBe('match')
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 1 of 3 videos',
    )
  })

  test('progressively discloses duration, vote, and preview filters', async () => {
    const { wrapper, videoStore } = mountPanel()
    seedVideos(videoStore)
    await nextTick()
    const details = wrapper.get('details')
    const summary = details.get('summary')
    const preview = details.get('#hover-previews-filter')
    const detailsElement = details.element as HTMLDetailsElement
    const summaryElement = summary.element as HTMLElement

    expect(summary.text()).toBe('More filters')
    expect(detailsElement.open).toBe(false)
    expect(details.attributes('open')).toBeUndefined()
    summaryElement.click()
    await nextTick()

    expect(detailsElement.open).toBe(true)
    expect(details.attributes('open')).toBeDefined()
    expect(details.findAllComponents(DualRangeSlider)).toHaveLength(2)

    const durationSlider = getRangeSlider(wrapper, 'duration-filter')
    const voteSlider = getRangeSlider(wrapper, 'vote-filter')

    expect(durationSlider.get('legend').text()).toBe('Duration')
    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0 min', '60+ min'])
    expect(durationSlider.findAll('[role="slider"]')).toHaveLength(2)
    expect(voteSlider.get('legend').text()).toBe('Vote score')
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0', '5+'])
    expect(voteSlider.findAll('[role="slider"]')).toHaveLength(2)
    expect(details.find('#min-duration').exists()).toBe(false)
    expect(details.find('#max-duration').exists()).toBe(false)
    expect(details.find('#min-votes').exists()).toBe(false)
    expect(details.find('#max-votes').exists()).toBe(false)
    expect(details.get('label[for="hover-previews-filter"]').text()).toBe(
      'Hover previews',
    )
    expect(
      preview.findAll('option').map((option) => option.attributes('value')),
    ).toEqual(['all', 'ready', 'missing'])
  })

  test('commits slider changes immediately and maps open endpoints to null', async () => {
    const { wrapper, filterStore, videoStore } = mountPanel()
    seedVideos(videoStore)
    filterStore.setPinnedMode('match')
    await nextTick()
    const durationSlider = getRangeSlider(wrapper, 'duration-filter')
    const voteSlider = getRangeSlider(wrapper, 'vote-filter')

    durationSlider.vm.$emit('update:lowerValue', 2)
    await nextTick()

    expect(filterStore.filters.minDurationMinutes).toBe(2)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 2 of 3 videos',
    )

    durationSlider.vm.$emit('update:upperValue', 5)
    await nextTick()

    expect(filterStore.filters.maxDurationMinutes).toBe(5)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 1 of 3 videos',
    )

    durationSlider.vm.$emit('update:upperValue', 60)
    await nextTick()

    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 2 of 3 videos',
    )

    filterStore.clearFilters()
    filterStore.setPinnedMode('match')
    await nextTick()
    voteSlider.vm.$emit('update:lowerValue', 3)
    await nextTick()

    expect(filterStore.filters.minVotes).toBe(3)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 1 of 3 videos',
    )

    voteSlider.vm.$emit('update:upperValue', 4)
    await nextTick()

    expect(filterStore.filters.maxVotes).toBe(4)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 0 of 3 videos',
    )

    voteSlider.vm.$emit('update:upperValue', 5)
    await nextTick()

    expect(filterStore.filters.maxVotes).toBeNull()
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 1 of 3 videos',
    )
  })

  test('allows exact ranges while neither handle can cross the other', async () => {
    const { wrapper, filterStore, videoStore } = mountPanel()
    seedVideos(videoStore)
    await nextTick()
    const durationSlider = getRangeSlider(wrapper, 'duration-filter')

    durationSlider.vm.$emit('update:upperValue', 5)
    await nextTick()
    const lowerHandle = durationSlider.get('[data-range-handle="lower"]')
    const upperHandle = durationSlider.get('[data-range-handle="upper"]')

    await lowerHandle.trigger('keydown', { key: 'End' })

    expect(filterStore.filters.minDurationMinutes).toBe(5)
    expect(filterStore.filters.maxDurationMinutes).toBe(5)

    await lowerHandle.trigger('keydown', { key: 'ArrowRight' })
    await upperHandle.trigger('keydown', { key: 'ArrowLeft' })

    expect(filterStore.filters.minDurationMinutes).toBe(5)
    expect(filterStore.filters.maxDurationMinutes).toBe(5)
  })

  test('updates dynamic labels and clamps active ranges as videos change', async () => {
    const { wrapper, filterStore, videoStore } = mountPanel()
    const durationSlider = getRangeSlider(wrapper, 'duration-filter')
    const voteSlider = getRangeSlider(wrapper, 'vote-filter')

    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0 min', '0 min'])
    expect(
      durationSlider
        .findAll('[role="slider"]')
        .every((handle) => handle.attributes('aria-disabled') === 'true'),
    ).toBe(true)
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0', '0'])

    videoStore.addVideos([
      buildParsedVideo({ id: 'remaining', duration: 5 * 60, votes: 4 }),
      buildParsedVideo({ id: 'removed', duration: 20 * 60, votes: 12 }),
    ])
    await nextTick()
    durationSlider.vm.$emit('update:lowerValue', 10)
    durationSlider.vm.$emit('update:upperValue', 15)
    voteSlider.vm.$emit('update:lowerValue', 8)
    voteSlider.vm.$emit('update:upperValue', 10)
    await nextTick()

    videoStore.removeVideo('removed')
    await nextTick()

    expect(filterStore.filters.minDurationMinutes).toBe(5)
    expect(filterStore.filters.maxDurationMinutes).toBeNull()
    expect(filterStore.filters.minVotes).toBe(4)
    expect(filterStore.filters.maxVotes).toBeNull()
    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['5 min', '5+ min'])
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['4', '4+'])

    videoStore.addVideos([
      buildParsedVideo({
        id: 'over-an-hour',
        duration: 60 * 60 + 1,
        votes: 20,
      }),
    ])
    await nextTick()

    expect(durationSlider.get('[data-range-value="upper"]').text()).toBe(
      '60+ min',
    )
    expect(voteSlider.get('[data-range-value="upper"]').text()).toBe('20+')
  })

  test('groups sort and view controls and gives every native select a unique explicit ID', async () => {
    const { wrapper, filterStore, appStateStore } = mountPanel()
    const sortAndView = wrapper.get(
      'fieldset[aria-labelledby="sort-view-heading"]',
    )
    const sort = sortAndView.get('#video-sort')
    const columns = sortAndView.get('#column-count')

    expect(sortAndView.get('#sort-view-heading').text()).toBe('Sort and view')
    expect(
      sort.findAll('option').map((option) => option.attributes('value')),
    ).toEqual([
      'votes-desc',
      'votes-asc',
      'duration-asc',
      'duration-desc',
      'title-asc',
    ])

    await sort.setValue('duration-desc')
    await columns.setValue('2')

    expect(filterStore.sortBy).toBe('duration-desc')
    expect(appStateStore.columnCount).toBe(2)

    const selectIds = wrapper
      .findAll('select')
      .map((select) => select.attributes('id'))
    expect(selectIds).toEqual([
      'pinned-videos-filter',
      'hover-previews-filter',
      'video-sort',
      'column-count',
    ])
    expect(new Set(selectIds).size).toBe(selectIds.length)
  })

  test('clears filter criteria and restores range endpoints while preserving sort and columns', async () => {
    const { wrapper, filterStore, videoStore, appStateStore } = mountPanel()
    seedVideos(videoStore)
    await nextTick()
    const durationSlider = getRangeSlider(wrapper, 'duration-filter')
    const voteSlider = getRangeSlider(wrapper, 'vote-filter')

    await wrapper.get('#video-filter-search').setValue('no match')
    await wrapper.get('#pinned-videos-filter').setValue('match')
    durationSlider.vm.$emit('update:lowerValue', 2)
    durationSlider.vm.$emit('update:upperValue', 10)
    voteSlider.vm.$emit('update:lowerValue', 1)
    voteSlider.vm.$emit('update:upperValue', 4)
    await wrapper.get('#hover-previews-filter').setValue('ready')
    await wrapper.get('#video-sort').setValue('title-asc')
    await wrapper.get('#column-count').setValue('2')

    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('Clear filters'))
    expect(clearButton?.text()).toBe('Clear filters (5)')

    await clearButton?.trigger('click')

    expect(filterStore.filters).toEqual({
      searchQuery: '',
      minDurationMinutes: null,
      maxDurationMinutes: null,
      minVotes: null,
      maxVotes: null,
      pinnedMode: 'keep-visible',
      previewAvailability: 'all',
    })
    expect(filterStore.activeFilterCount).toBe(0)
    expect(filterStore.sortBy).toBe('title-asc')
    expect(appStateStore.columnCount).toBe(2)
    expect(
      (wrapper.get('#video-filter-search').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0 min', '60+ min'])
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0', '5+'])
    expect(
      (wrapper.get('#pinned-videos-filter').element as HTMLSelectElement).value,
    ).toBe('keep-visible')
    expect(
      (wrapper.get('#hover-previews-filter').element as HTMLSelectElement)
        .value,
    ).toBe('all')
    expect(clearButton?.text()).toBe('Clear filters')
    expect(clearButton?.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 3 of 3 videos',
    )
  })

  test('reactively reflects range criteria cleared outside the panel', async () => {
    const { wrapper, filterStore, videoStore } = mountPanel()
    seedVideos(videoStore)
    await nextTick()
    const durationSlider = getRangeSlider(wrapper, 'duration-filter')
    const voteSlider = getRangeSlider(wrapper, 'vote-filter')

    durationSlider.vm.$emit('update:lowerValue', 3)
    durationSlider.vm.$emit('update:upperValue', 8)
    voteSlider.vm.$emit('update:lowerValue', 2)
    voteSlider.vm.$emit('update:upperValue', 4)
    await nextTick()

    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['3 min', '8 min'])
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['2', '4'])

    filterStore.clearFilters()
    await nextTick()

    expect(
      durationSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0 min', '60+ min'])
    expect(
      voteSlider.findAll('[data-range-value]').map((value) => value.text()),
    ).toEqual(['0', '5+'])
    expect(filterStore.activeFilterCount).toBe(0)
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      'Showing 3 of 3 videos',
    )
  })

  test('reveals hidden navigation when closing the panel hands off focus', async () => {
    const context = createPresentationTestContext({
      useCases: {
        filterVideosUseCase: createFilterVideosUseCase(),
      },
    })
    const TestHost = defineComponent({
      components: { FilterPanel, NavBar },
      template: '<FilterPanel /><NavBar />',
    })
    setScrollY(0)
    const wrapper = mount(TestHost, {
      attachTo: document.body,
      global: {
        ...context.global,
        stubs: {
          FileInput: true,
          NavTitle: true,
        },
      },
    })

    try {
      const appStateStore = useAppStateStore(context.pinia)
      const panel = wrapper.get('#video-filter-panel')
      const navigation = wrapper.get('.nav-shell')
      const navigationToggle = wrapper.get('#filter-panel-navigation-toggle')
      const internalToggle = panel.get('button[aria-label="Hide filters"]')
      const internalToggleElement = internalToggle.element as HTMLButtonElement

      expect(panel.attributes('aria-hidden')).toBeUndefined()
      expect(panel.attributes('inert')).toBeUndefined()
      expect(internalToggle.attributes('type')).toBe('button')
      expect(internalToggle.attributes('aria-label')).toBe('Hide filters')

      setScrollY(160)
      window.dispatchEvent(new Event('scroll'))
      await nextTick()

      expect(navigation.classes()).toContain('nav-shell--hidden')

      internalToggleElement.focus()
      expect(document.activeElement).toBe(internalToggleElement)

      await internalToggle.trigger('click')

      expect(appStateStore.isFilterPanelOpen).toBe(false)
      expect(panel.classes()).toContain('closed')
      expect(panel.attributes('aria-hidden')).toBe('true')
      expect(panel.attributes('inert')).toBeDefined()
      expect(document.activeElement).toBe(navigationToggle.element)
      expect(navigation.classes()).not.toContain('nav-shell--hidden')
    } finally {
      wrapper.unmount()
      setScrollY(0)
    }
  })

  test('blurs the internal toggle when the navigation focus target is absent', async () => {
    const context = createPresentationTestContext({
      useCases: {
        filterVideosUseCase: createFilterVideosUseCase(),
      },
    })
    const wrapper = mount(FilterPanel, {
      attachTo: document.body,
      global: context.global,
    })

    try {
      const appStateStore = useAppStateStore(context.pinia)
      const panel = wrapper.get('#video-filter-panel')
      const internalToggle = panel.get('button[aria-label="Hide filters"]')
      const internalToggleElement = internalToggle.element as HTMLButtonElement

      internalToggleElement.focus()
      expect(document.activeElement).toBe(internalToggleElement)

      await internalToggle.trigger('click')

      expect(appStateStore.isFilterPanelOpen).toBe(false)
      expect(panel.attributes('aria-hidden')).toBe('true')
      expect(panel.attributes('inert')).toBeDefined()
      expect(document.activeElement).not.toBe(internalToggleElement)
    } finally {
      wrapper.unmount()
    }
  })
})
