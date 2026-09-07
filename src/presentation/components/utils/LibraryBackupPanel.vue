<script setup lang="ts">
import { inject, ref } from 'vue'
import { LIBRARY_BACKUP_KEY } from '@presentation/di/injectionKeys'
import { useVideoStore } from '@presentation/stores'
import type { LibraryBackupSummary } from '@app/ports/ILibraryBackup'

const backup = inject(LIBRARY_BACKUP_KEY, undefined)
const store = useVideoStore()
const otherTabsClosed = ref(false)
const replacementConfirmed = ref(false)
const archive = ref<File | null>(null)
const summary = ref<LibraryBackupSummary | null>(null)
const status = ref('')
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Library operation failed.'
async function download() {
  if (!backup || !otherTabsClosed.value || store.libraryRecoveryRequired) return
  try {
    const blob = await store.runDiagnosticWork('backup', () =>
      backup.createArchive(),
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bvr-library-${new Date().toISOString().replace(/[:.]/g, '-')}.bvrbackup`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    status.value =
      'Download started. Keep this private archive somewhere safe and verify it before testing.'
  } catch (error) {
    status.value = message(error)
  }
}
async function select(event: Event) {
  archive.value = null
  summary.value = null
  replacementConfirmed.value = false
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !backup) return
  status.value = 'Validating archive and binary checksums…'
  try {
    summary.value = await store.runDiagnosticWork('validate backup', () =>
      backup.inspectArchive(file),
    )
    archive.value = file
    status.value = 'Archive validated. Nothing has been replaced.'
  } catch (error) {
    status.value = message(error)
  }
}
async function restore() {
  if (
    !backup ||
    !archive.value ||
    !summary.value ||
    !otherTabsClosed.value ||
    !replacementConfirmed.value
  )
    return
  const selected = archive.value
  status.value =
    'Restoring library and previews. Do not close or reload this tab.'
  try {
    await store.runDiagnosticWork('restore', () =>
      backup.restoreArchive(selected),
    )
    store.setLibraryRecoveryRequired(false)
    store.requireLibraryReload()
    status.value =
      'Restore committed. Reload before using the library; reselect original videos when needed.'
  } catch (error) {
    status.value = message(error)
    store.setLibraryRecoveryRequired(backup.recoveryRequired())
  }
}
const reload = () => window.location.reload()
</script>

<template>
  <section v-if="backup" class="library-backup">
    <h2>Library backup / restore</h2>
    <p>
      Includes both databases: library, votes, tags, covers, failure records and
      generated clips/stills/seeks. Excludes original videos, file permissions,
      active queues and UI preferences. Private, local download; maximum 1 GiB.
    </p>
    <p v-if="store.libraryRecoveryRequired" role="alert">
      An interrupted restore needs recovery. Reselect the intended or safety
      archive below. Normal library access is blocked.
    </p>
    <label
      ><input
        v-model="otherTabsClosed"
        data-testid="other-tabs-closed"
        type="checkbox"
      />
      All other app tabs/windows are closed.</label
    >
    <button
      type="button"
      data-testid="backup-library"
      :disabled="
        !store.canRunDiagnostics ||
        !otherTabsClosed ||
        store.libraryRecoveryRequired
      "
      @click="download"
    >
      Download full backup
    </button>
    <p v-if="!store.canRunDiagnostics && !store.libraryReloadRequired">
      Finish pending ingestion/previews, including focus-paused work, before
      maintenance.
    </p>
    <label
      >Validate a backup
      <input
        type="file"
        accept=".bvrbackup"
        :disabled="!store.canRunDiagnostics"
        @change="select"
    /></label>
    <template v-if="summary">
      <p>
        Created {{ summary.createdAt }} · Library schema
        {{ summary.libraryVersion }} · Cache schema {{ summary.cacheVersion }} ·
        {{ summary.archiveBytes }} bytes
      </p>
      <p>
        Build {{ summary.build.revision ?? 'unknown'
        }}{{ summary.build.dirty ? ' (uncommitted changes)' : '' }}
      </p>
      <ul>
        <li v-for="(count, name) in summary.counts" :key="name">
          {{ name }}: {{ count }}
        </li>
      </ul>
      <label
        ><input
          v-model="replacementConfirmed"
          data-testid="confirm-library-replacement"
          type="checkbox"
        />
        I saved a separate safety backup and understand this replaces both
        databases, removing test-created entries.</label
      >
      <button
        type="button"
        data-testid="restore-library"
        :disabled="
          !store.canRunDiagnostics || !otherTabsClosed || !replacementConfirmed
        "
        @click="restore"
      >
        Replace library from backup
      </button>
    </template>
    <p v-if="status" role="status">{{ status }}</p>
    <button v-if="store.libraryReloadRequired" type="button" @click="reload">
      Reload restored library
    </button>
  </section>
</template>

<style scoped>
.library-backup {
  border-top: 1px solid #394556;
  overflow-wrap: anywhere;
}
label {
  display: block;
  margin: 0.75rem 0;
}
p {
  font-size: 0.85rem;
}
</style>
