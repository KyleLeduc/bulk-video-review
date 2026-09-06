import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import { createPresentationTestContext } from '@test-utils/index'
import App from './App.vue'

describe('App', () => {
  test('pauses previews on blur or hidden and resumes only when both visible and focused', async () => {
    let focused = true
    let hidden = false
    const focus = vi
      .spyOn(document, 'hasFocus')
      .mockImplementation(() => focused)
    const visibility = vi
      .spyOn(document, 'hidden', 'get')
      .mockImplementation(() => hidden)
    const { global } = createPresentationTestContext()
    const wrapper = mount(App, {
      global: {
        ...global,
        stubs: {
          FilterPanel: true,
          NavBar: true,
          VideoGallery: true,
          DiagnosticsPanel: true,
        },
      },
    })
    const store = useVideoStore()
    expect(store.isPreviewProcessingPaused).toBe(false)
    focused = false
    window.dispatchEvent(new Event('blur'))
    expect(store.isPreviewProcessingPaused).toBe(true)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    focused = true
    window.dispatchEvent(new Event('focus'))
    expect(store.isPreviewProcessingPaused).toBe(true)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.isPreviewProcessingPaused).toBe(false)
    wrapper.unmount()
    focused = false
    window.dispatchEvent(new Event('blur'))
    expect(store.isPreviewProcessingPaused).toBe(false)
    focus.mockRestore()
    visibility.mockRestore()
  })
  test('shows the ingestion progress toast while ingestion is active', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(App, {
      global: {
        ...global,
        stubs: {
          FilterPanel: true,
          NavBar: true,
          VideoGallery: true,
          DiagnosticsPanel: true,
        },
      },
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 2,
      newCount: 3,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 3,
    }

    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ingestion-toast').exists()).toBe(true)
  })
})
