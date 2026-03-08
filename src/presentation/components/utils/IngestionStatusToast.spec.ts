import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import { createPresentationTestContext } from '@test-utils/index'
import IngestionStatusToast from './IngestionStatusToast.vue'

describe('IngestionStatusToast', () => {
  test('renders a legend for the existing, new, and error meter colors', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    const legend = wrapper.get('.ingestion-toast__legend')
    expect(legend.text()).toContain('Existing')
    expect(legend.text()).toContain('New')
    expect(legend.text()).toContain('Error')
  })

  test('renders the queue summary and close button in a dedicated actions row', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    const actions = wrapper.get('.ingestion-toast__actions')
    expect(actions.find('.queue-summary').exists()).toBe(true)
    expect(actions.find('.ingestion-toast__close').exists()).toBe(true)
  })

  test('closes when the dismiss button is clicked', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(IngestionStatusToast, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 5,
      scanned: 5,
      existingCount: 1,
      newCount: 4,
      knownErrorCount: 0,
      createdCount: 1,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

    await wrapper.get('.ingestion-toast__close').trigger('click')

    expect(wrapper.find('.ingestion-toast').exists()).toBe(false)
  })

  test('auto closes three seconds after ingestion finishes', async () => {
    vi.useFakeTimers()

    try {
      const { global } = createPresentationTestContext({
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      const store = useVideoStore()
      store.ingestionProgress = {
        total: 3,
        scanned: 3,
        existingCount: 1,
        newCount: 2,
        knownErrorCount: 0,
        createdCount: 1,
        failedCount: 0,
        completedCount: 1,
      }

      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      store.ingestionProgress = {
        ...store.ingestionProgress,
        completedCount: 3,
        createdCount: 2,
      }

      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(2999)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(1)
      await nextTick()
      expect(wrapper.find('.ingestion-toast').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('shows a live elapsed time and freezes the completed duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'))

    try {
      const { global } = createPresentationTestContext({
        sessionRegistry: {
          acquireObjectUrl: vi.fn(() => ''),
        },
      })

      const wrapper = mount(IngestionStatusToast, {
        global,
      })

      const store = useVideoStore()
      ;(store as any).ingestionStartedAtMs = Date.now()
      ;(store as any).ingestionCompletedAtMs = null
      store.ingestionProgress = {
        total: 3,
        scanned: 3,
        existingCount: 1,
        newCount: 2,
        knownErrorCount: 0,
        createdCount: 1,
        failedCount: 0,
        completedCount: 1,
      }

      await nextTick()
      expect(wrapper.text()).toContain('Elapsed 0.0s')

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()
      expect(wrapper.text()).toContain('Elapsed 1.2s')
      ;(store as any).ingestionCompletedAtMs = Date.now()
      store.ingestionProgress = {
        ...store.ingestionProgress,
        completedCount: 3,
        createdCount: 2,
      }

      await nextTick()
      expect(wrapper.text()).toContain('Completed in 1.2s')

      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(wrapper.text()).toContain('Completed in 1.2s')
    } finally {
      vi.useRealTimers()
    }
  })
})
