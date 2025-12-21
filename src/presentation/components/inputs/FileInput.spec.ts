import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import {
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'
import FileInput from './FileInput.vue'

describe('FileInput', () => {
  test('clears the input value after handling a selection so the same files can be reselected', async () => {
    const { global, mocks } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FileInput, {
      global,
    })

    const input = wrapper.get('input[type="file"]')
    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)

    Object.defineProperty(input.element, 'files', {
      value: files,
      writable: false,
    })

    let currentValue = 'C:\\\\fakepath\\\\sample.mp4'
    let clearCalls = 0
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      get: () => currentValue,
      set: (next: string) => {
        clearCalls += 1
        currentValue = next
      },
    })

    await input.trigger('change')
    await new Promise((resolve) => setTimeout(resolve))

    expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledTimes(1)
    expect(clearCalls).toBe(1)
    expect(currentValue).toBe('')
  })
})
