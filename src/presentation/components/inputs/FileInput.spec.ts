import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useVideoStore } from '@presentation/stores'
import {
  createMockFileList,
  createPresentationTestContext,
} from '@test-utils/index'
import FileInput from './FileInput.vue'

const flushAsyncInputHandler = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('FileInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => {
        if (type === 'video/mp4' || type === 'video/webm') {
          return 'probably'
        }

        return ''
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('clicking add videos opens the folder picker while hover uses delayed open and close for the dropdown menu', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FileInput, {
      global,
    })

    const shell = wrapper.get('[data-testid="upload-picker"]')
    const trigger = wrapper.get('[data-testid="upload-picker-trigger"]')
    const folderInput = wrapper.get('input[data-picker-mode="folder"]')
    const folderElement = folderInput.element as HTMLInputElement
    const folderClickSpy = vi.spyOn(folderElement, 'click')

    expect(trigger.text()).toContain('Add videos')
    expect(folderInput.attributes('webkitdirectory')).toBeDefined()
    expect(folderInput.attributes('accept')).toContain('video/mp4')
    expect(folderInput.attributes('accept')).toContain('.mp4')
    expect(folderInput.attributes('accept')).toContain('video/webm')
    expect(folderInput.attributes('accept')).toContain('.webm')
    expect(folderInput.attributes('accept')).not.toContain('video/quicktime')

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )

    await trigger.trigger('click')

    expect(folderClickSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )

    await shell.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(999)

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )

    await vi.advanceTimersByTimeAsync(1)

    expect(wrapper.get('[data-testid="upload-picker-menu"]').text()).toContain(
      'Choose folder',
    )
    expect(wrapper.get('[data-testid="upload-picker-menu"]').text()).toContain(
      'Choose files',
    )

    await shell.trigger('mouseleave')

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      true,
    )

    await vi.advanceTimersByTimeAsync(249)

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      true,
    )

    await vi.advanceTimersByTimeAsync(1)

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )
  })

  test('selecting a dropdown option closes the dropdown immediately', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FileInput, {
      global,
    })

    const shell = wrapper.get('[data-testid="upload-picker"]')
    const fileInput = wrapper.get('input[data-picker-mode="files"]')
    const fileElement = fileInput.element as HTMLInputElement
    const fileClickSpy = vi.spyOn(fileElement, 'click')

    await shell.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)

    await wrapper
      .get('[data-testid="upload-picker-menu"] [role="menuitem"]:last-child')
      .trigger('click')

    expect(fileClickSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )
  })

  test('clears both picker inputs after handling a selection so the same source can be reselected', async () => {
    const { global, mocks } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FileInput, {
      global,
    })

    const file = new File(['video-bytes'], 'sample.mp4', { type: 'video/mp4' })
    const files = createMockFileList(file)
    const folderInput = wrapper.get('input[data-picker-mode="folder"]')

    Object.defineProperty(folderInput.element, 'files', {
      value: files,
      writable: false,
    })

    let folderValue = 'C:\\\\fakepath\\\\clips'
    let folderClearCalls = 0
    Object.defineProperty(folderInput.element, 'value', {
      configurable: true,
      get: () => folderValue,
      set: (next: string) => {
        folderClearCalls += 1
        folderValue = next
      },
    })

    await folderInput.trigger('change')
    await flushAsyncInputHandler()

    await wrapper.get('[data-testid="upload-picker"]').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)

    const fileInput = wrapper.get('input[data-picker-mode="files"]')

    Object.defineProperty(fileInput.element, 'files', {
      value: files,
      writable: false,
    })

    let fileValue = 'C:\\\\fakepath\\\\sample.mp4'
    let fileClearCalls = 0
    Object.defineProperty(fileInput.element, 'value', {
      configurable: true,
      get: () => fileValue,
      set: (next: string) => {
        fileClearCalls += 1
        fileValue = next
      },
    })

    await fileInput.trigger('change')
    await flushAsyncInputHandler()

    expect(mocks.useCases.addVideosUseCase.execute).toHaveBeenCalledTimes(2)
    expect(folderClearCalls).toBe(1)
    expect(folderValue).toBe('')
    expect(fileClearCalls).toBe(1)
    expect(fileValue).toBe('')
  })

  test('disables file selection while ingestion is already running', async () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(FileInput, {
      global,
    })

    const store = useVideoStore()
    store.ingestionProgress = {
      total: 4,
      scanned: 4,
      existingCount: 1,
      newCount: 3,
      knownErrorCount: 0,
      createdCount: 0,
      failedCount: 0,
      completedCount: 2,
    }

    await nextTick()

    expect(
      wrapper
        .get('[data-testid="upload-picker-trigger"]')
        .attributes('disabled'),
    ).toBe('')
    expect(
      wrapper.get('input[data-picker-mode="folder"]').attributes('disabled'),
    ).toBe('')
    expect(
      wrapper.get('input[data-picker-mode="files"]').attributes('disabled'),
    ).toBe('')

    await wrapper.get('[data-testid="upload-picker"]').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)

    expect(wrapper.find('[data-testid="upload-picker-menu"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.get('[data-testid="upload-picker-trigger"]').text(),
    ).toContain('Scanning videos…')
  })
})
