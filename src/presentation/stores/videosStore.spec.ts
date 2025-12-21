import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  buildParsedVideo,
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'

const StoreHarness = defineComponent({
  name: 'StoreHarness',
  setup() {
    const store = useVideoStore()
    return { store }
  },
  template: '<div />',
})

describe('useVideoStore', () => {
  test('ignores re-uploaded videos without replacing session state', async () => {
    let callCount = 0
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            callCount += 1
            yield buildParsedVideo({
              id: 'id-1',
              url: callCount === 1 ? 'blob:first' : 'blob:second',
            })
          }),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
    })

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)
    expect(store.sortByVotes[0]?.url).toBe('blob:first')

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)
    expect(store.sortByVotes[0]?.url).toBe('blob:first')
    expect(mocks.sessionRegistry.unregisterFile).not.toHaveBeenCalled()
  })

  test('releases session registry entries when videos are removed', async () => {
    const { global, mocks } = createPresentationTestContext({
      useCases: {
        addVideosUseCase: {
          execute: vi.fn(async function* () {
            yield buildParsedVideo({ id: 'id-1', url: 'blob:to-remove' })
          }),
        },
      },
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(StoreHarness, {
      global,
    })

    const store = (wrapper.vm as any).store as ReturnType<typeof useVideoStore>
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    await store.addVideosFromFiles(files)
    expect(store.sortByVotes).toHaveLength(1)

    store.removeVideo('id-1')
    expect(store.sortByVotes).toHaveLength(0)
    expect(mocks.sessionRegistry.unregisterFile).toHaveBeenCalledWith('id-1')
  })
})
