import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createPresentationTestContext } from '@test-utils/index'
import { useVideoStore } from '@presentation/stores'
import { INSPECT_FAILED_FILES_KEY } from '@presentation/di/injectionKeys'
import FileAuditPanel from './FileAuditPanel.vue'

it('offers an explicit private audit and a manually copyable result when clipboard access fails', async () => {
  const { global } = createPresentationTestContext()
  const execute = vi.fn().mockResolvedValue([])
  global.provide[INSPECT_FAILED_FILES_KEY as symbol] = { execute }
  const wrapper = mount(FileAuditPanel, { global })
  vi.spyOn(useVideoStore(), 'getFailedPreviewSources').mockReturnValue([
    {
      videoId: 'v',
      title: 'private.mp4',
      failures: { keyframes: 'unsupported' },
    },
  ])
  await wrapper.get('[data-testid="inspect-failed-files"]').trigger('click')
  await flushPromises()
  expect(execute).toHaveBeenCalledOnce()
  expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
  expect(wrapper.text()).toContain('filenames')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Copy audit')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Select and copy the audit below')
  wrapper.unmount()
})
