import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createPresentationTestContext } from '@test-utils/index'
import { LIBRARY_BACKUP_KEY } from '@presentation/di/injectionKeys'
import { useVideoStore } from '@presentation/stores'
import LibraryBackupPanel from './LibraryBackupPanel.vue'

const summary = {
  createdAt: '2026-09-07',
  build: { revision: null, dirty: null, source: 'unknown' },
  libraryVersion: 4,
  cacheVersion: 1,
  counts: { videoCacheDto: 2, previewProducts: 4 },
  archiveBytes: 100,
}
function setup(invalid = false) {
  const context = createPresentationTestContext()
  const service = {
    recoveryRequired: () => false,
    createArchive: vi.fn(),
    inspectArchive: invalid
      ? vi.fn().mockRejectedValue(new Error('Checksum failed'))
      : vi.fn().mockResolvedValue(summary),
    restoreArchive: vi.fn().mockResolvedValue(undefined),
  }
  context.global.provide[LIBRARY_BACKUP_KEY as symbol] = service
  const wrapper = mount(LibraryBackupPanel, { global: context.global })
  return { wrapper, service }
}
async function select(wrapper: ReturnType<typeof setup>['wrapper']) {
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File(['archive'], 'library.bvrbackup')],
  })
  await input.trigger('change')
  await flushPromises()
}
it('requires validation and explicit replacement confirmation, then blocks stale UI until reload', async () => {
  const { wrapper, service } = setup()
  await select(wrapper)
  expect(wrapper.text()).toContain('previewProducts: 4')
  expect(
    wrapper.get('[data-testid=restore-library]').attributes('disabled'),
  ).toBeDefined()
  await wrapper.get('[data-testid=other-tabs-closed]').setValue(true)
  await wrapper.get('[data-testid=confirm-library-replacement]').setValue(true)
  await wrapper.get('[data-testid=restore-library]').trigger('click')
  await flushPromises()
  expect(service.restoreArchive).toHaveBeenCalledOnce()
  expect(useVideoStore().isDiagnosticsBusy).toBe(true)
  expect(wrapper.text()).toContain('Reload')
  wrapper.unmount()
})
it('does not offer replacement for an invalid archive', async () => {
  const { wrapper, service } = setup(true)
  await select(wrapper)
  expect(wrapper.text()).toContain('Checksum failed')
  expect(wrapper.find('[data-testid=restore-library]').exists()).toBe(false)
  expect(service.restoreArchive).not.toHaveBeenCalled()
  wrapper.unmount()
})
