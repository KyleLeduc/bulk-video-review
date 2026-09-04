import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, type PropType } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { createFilterVideosUseCase } from '@app/usecases'
import type { ParsedVideo } from '@domain/entities'
import { useVideoFilterStore, useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createPresentationTestContext,
} from '@test-utils/index'
import VideoGallery from './VideoGallery.vue'

const VideoCardStub = defineComponent({
  name: 'VideoCard',
  props: {
    video: {
      type: Object as PropType<ParsedVideo>,
      required: true,
    },
  },
  template:
    '<article class="video-card-stub" :data-video-id="video.id">{{ video.id }}</article>',
})

const mountGallery = () => {
  const context = createPresentationTestContext({
    useCases: {
      filterVideosUseCase: createFilterVideosUseCase(),
    },
  })
  const wrapper = mount(VideoGallery, {
    global: {
      ...context.global,
      stubs: {
        VideoCard: VideoCardStub,
      },
    },
  })

  return {
    wrapper,
    videoStore: useVideoStore(context.pinia),
    filterStore: useVideoFilterStore(context.pinia),
  }
}

const renderedVideoIds = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('[data-video-id]')
    .map((card) => card.attributes('data-video-id'))

describe('VideoGallery', () => {
  test('prompts for videos when the collection is empty', () => {
    const { wrapper } = mountGallery()
    const feedback = wrapper.get('[role="status"]')

    expect(feedback.element.tagName).toBe('P')
    expect(feedback.text()).toBe('Add videos to begin reviewing')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(renderedVideoIds(wrapper)).toEqual([])
  })

  test('keeps the gallery container mounted while visible results change', async () => {
    const { wrapper, videoStore, filterStore } = mountGallery()
    const initialContainer = wrapper.get('.container')

    expect((initialContainer.element as HTMLElement).style.display).toBe('none')

    videoStore.addVideos([
      buildParsedVideo({ id: 'alpha', title: 'Alpha walkthrough' }),
    ])
    await nextTick()

    expect(wrapper.get('.container').element).toBe(initialContainer.element)
    expect(
      (wrapper.get('.container').element as HTMLElement).style.display,
    ).toBe('')
    expect(renderedVideoIds(wrapper)).toEqual(['alpha'])

    filterStore.setPinnedMode('match')
    filterStore.setSearchQuery('missing')
    await nextTick()

    expect(wrapper.get('.container').element).toBe(initialContainer.element)
    expect(
      (wrapper.get('.container').element as HTMLElement).style.display,
    ).toBe('none')
    expect(renderedVideoIds(wrapper)).toEqual([])

    filterStore.clearFilters()
    await nextTick()

    expect(wrapper.get('.container').element).toBe(initialContainer.element)
    expect(
      (wrapper.get('.container').element as HTMLElement).style.display,
    ).toBe('')
    expect(renderedVideoIds(wrapper)).toEqual(['alpha'])
  })

  test('explains when loaded videos do not match the active filters', async () => {
    const { wrapper, videoStore, filterStore } = mountGallery()
    videoStore.addVideos([
      buildParsedVideo({ id: 'alpha', title: 'Alpha walkthrough' }),
    ])
    filterStore.setPinnedMode('match')
    filterStore.setSearchQuery('missing')
    await nextTick()

    const feedback = wrapper.get('[role="status"]')
    const clearButton = wrapper.get('button')

    expect(feedback.element.tagName).toBe('P')
    expect(feedback.text()).toBe('No videos match these filters')
    expect(clearButton.text()).toBe('Clear filters')
    expect(clearButton.attributes('type')).toBe('button')
    expect(renderedVideoIds(wrapper)).toEqual([])
  })

  test('clears filters and restores matching cards from real store state', async () => {
    const { wrapper, videoStore, filterStore } = mountGallery()
    videoStore.addVideos([
      buildParsedVideo({ id: 'alpha', title: 'Alpha', votes: 1 }),
      buildParsedVideo({ id: 'beta', title: 'Beta', votes: 2 }),
    ])
    filterStore.setPinnedMode('match')
    filterStore.setSearchQuery('missing')
    await nextTick()
    const clearFilters = vi.spyOn(filterStore, 'clearFilters')

    expect(renderedVideoIds(wrapper)).toEqual([])

    await wrapper.get('button').trigger('click')

    expect(clearFilters).toHaveBeenCalledTimes(1)
    expect(filterStore.filters.searchQuery).toBe('')
    expect(filterStore.filters.pinnedMode).toBe('keep-visible')
    expect(renderedVideoIds(wrapper)).toEqual(['beta', 'alpha'])
  })
})
