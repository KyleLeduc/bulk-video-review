import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import { createPresentationTestContext } from '@test-utils/index'
import App from './App.vue'

describe('App', () => {
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
