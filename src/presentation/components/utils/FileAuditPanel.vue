<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { INSPECT_FAILED_FILES_KEY } from '@presentation/di/injectionKeys'
import { useVideoStore } from '@presentation/stores'
import {
  formatFileAudit,
  type FileAuditItem,
} from '@app/usecases/InspectFailedVideoFilesUseCase'
import { BUILD_IDENTITY } from '@/shared/buildIdentity'

const inspector = inject(INSPECT_FAILED_FILES_KEY, undefined)
const store = useVideoStore()
const results = ref<FileAuditItem[] | null>(null)
const status = ref('')
const completed = ref(0)
const total = ref(0)
const format = ref('text')
const running = ref(false)
let controller: AbortController | undefined
const output = computed(() =>
  results.value == null
    ? ''
    : format.value === 'json'
      ? JSON.stringify(
          {
            schemaVersion: 1,
            mode: 'failed-file-audit',
            identity: BUILD_IDENTITY,
            containsPrivateFilenames: true,
            items: results.value,
          },
          null,
          2,
        )
      : formatFileAudit(results.value),
)
async function inspect() {
  if (!inspector) return
  status.value = ''
  const sources = store.getFailedPreviewSources()
  total.value = sources.length
  completed.value = 0
  controller = new AbortController()
  const signal = controller.signal
  running.value = true
  const collected: FileAuditItem[] = []
  try {
    results.value = await store.runDiagnosticWork('inspection', () =>
      inspector.execute(sources, {
        signal,
        onItem: (item) => {
          collected.push(item)
          completed.value++
        },
      }),
    )
    status.value = `Inspected ${completed.value} of ${total.value}. Original videos were not changed.`
  } catch (error) {
    results.value = collected
    status.value = signal.aborted
      ? `Cancelled; ${completed.value} results retained.`
      : error instanceof Error
        ? error.message
        : 'Inspection failed.'
  } finally {
    running.value = false
  }
}
async function copy() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('unavailable')
    await navigator.clipboard.writeText(output.value)
    status.value = 'Copied private file audit.'
  } catch {
    status.value = 'Clipboard unavailable. Select and copy the audit below.'
  }
}
function download() {
  const url = URL.createObjectURL(
    new Blob([output.value], {
      type:
        format.value === 'json'
          ? 'application/json'
          : 'text/plain;charset=utf-8',
    }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `bvr-private-file-audit.${format.value === 'json' ? 'json' : 'txt'}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section v-if="inspector" class="audit">
    <h2>Failed-file audit</h2>
    <p>
      Read-only header checks. Includes private filenames and available
      folder-relative paths; no upload or automatic repair.
    </p>
    <p>
      Current-session failures only, including files that could not produce a
      cover. Reselect originals after a reload to collect a new audit.
    </p>
    <button
      type="button"
      data-testid="inspect-failed-files"
      :disabled="!store.canRunDiagnostics || store.libraryRecoveryRequired"
      @click="inspect"
    >
      Inspect failed files
    </button>
    <button v-if="running" type="button" @click="controller?.abort()">
      Cancel inspection
    </button>
    <p v-if="running">Inspecting {{ completed }}/{{ total }} files</p>
    <p v-if="!store.canRunDiagnostics && !running">
      Wait for all pending work, including focus-paused jobs.
    </p>
    <p v-if="status" role="status">{{ status }}</p>
    <template v-if="results !== null">
      <label
        >Audit format
        <select v-model="format">
          <option value="text">Readable list</option>
          <option value="json">JSON manifest</option>
        </select></label
      >
      <button type="button" @click="copy">Copy audit</button>
      <button type="button" @click="download">Download audit</button>
      <textarea
        readonly
        rows="12"
        :value="output"
        aria-label="Private failed-file audit"
      />
    </template>
  </section>
</template>

<style scoped>
.audit {
  border-top: 1px solid #394556;
  padding-top: 12px;
}
textarea {
  width: 100%;
  box-sizing: border-box;
}
p {
  font-size: 0.85rem;
}
</style>
