import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
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
  votes: {
    positive: 2,
    negative: 1,
    zero: 3,
    nonzero: 3,
    missingMetadata: 1,
    orphanMetadata: 5,
  },
}
afterEach(() => vi.restoreAllMocks())
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

it('displays and copies aggregate vote evidence without restoring or backing up the live library', async () => {
  const { wrapper, service } = setup()
  const writeText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined)
  await select(wrapper)
  const evidence = wrapper.get('[data-testid=backup-vote-summary]').text()
  expect(evidence).toContain('Nonzero vote records: 3')
  expect(evidence).toContain('positive: 2')
  expect(evidence).toContain('negative: 1')
  expect(evidence).toContain('Zero vote records: 3')
  expect(evidence).toContain('Video records without metadata: 1')
  expect(evidence).toContain('Metadata records without video content: 5')
  const output = (
    wrapper.get('textarea[aria-label="Backup inspection summary"]')
      .element as HTMLTextAreaElement
  ).value
  const report = JSON.parse(output)
  expect(report.mode).toBe('library-backup-inspection-v1')
  expect(report.origin).toBe(window.location.origin)
  expect(report.inspectorBuild).toHaveProperty('revision')
  expect(report.archive.votes).toEqual(summary.votes)
  await wrapper.get('[data-testid=copy-backup-summary]').trigger('click')
  expect(writeText).toHaveBeenCalledWith(output)
  expect(service.createArchive).not.toHaveBeenCalled()
  expect(service.restoreArchive).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('explains an all-zero archive and keeps the report selectable if clipboard permission is denied', async () => {
  const { wrapper, service } = setup()
  service.inspectArchive.mockResolvedValue({
    ...summary,
    votes: {
      positive: 0,
      negative: 0,
      zero: 2,
      nonzero: 0,
      missingMetadata: 0,
      orphanMetadata: 0,
    },
  })
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new Error('denied'),
  )
  await select(wrapper)
  expect(wrapper.text()).toContain('This archive contains no nonzero votes')
  await wrapper.get('[data-testid=copy-backup-summary]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Select and copy the summary below')
  expect(
    wrapper
      .get('textarea[aria-label="Backup inspection summary"]')
      .attributes('readonly'),
  ).toBeDefined()
  expect(service.restoreArchive).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('removes previous vote evidence if a replacement selection fails validation', async () => {
  const { wrapper, service } = setup()
  await select(wrapper)
  expect(wrapper.find('[data-testid=backup-vote-summary]').exists()).toBe(true)
  service.inspectArchive.mockRejectedValue(new Error('Checksum failed'))
  await select(wrapper)
  expect(wrapper.find('[data-testid=backup-vote-summary]').exists()).toBe(false)
  expect(wrapper.find('[data-testid=copy-backup-summary]').exists()).toBe(false)
  expect(
    wrapper.find('textarea[aria-label="Backup inspection summary"]').exists(),
  ).toBe(false)
  expect(service.restoreArchive).not.toHaveBeenCalled()
  wrapper.unmount()
})

it.each(['copy-first', 'restore-first'])(
  'keeps restore safety messages visible when clipboard completion races it (%s)',
  async (order) => {
    const { wrapper, service } = setup()
    let finishCopy!: () => void
    let finishRestore!: () => void
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve
        }),
    )
    service.restoreArchive.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRestore = resolve
        }),
    )
    await select(wrapper)
    await wrapper.get('[data-testid=other-tabs-closed]').setValue(true)
    await wrapper
      .get('[data-testid=confirm-library-replacement]')
      .setValue(true)
    if (order === 'copy-first')
      await wrapper.get('[data-testid=copy-backup-summary]').trigger('click')
    await wrapper.get('[data-testid=restore-library]').trigger('click')
    if (order === 'restore-first')
      await wrapper.get('[data-testid=copy-backup-summary]').trigger('click')
    finishCopy()
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Restoring library and previews. Do not close or reload this tab.',
    )
    expect(wrapper.text()).not.toContain('No library data was changed')
    finishRestore()
    await flushPromises()
    await wrapper.get('[data-testid=copy-backup-summary]').trigger('click')
    finishCopy()
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Restore committed. Reload before using the library',
    )
    wrapper.unmount()
  },
)
