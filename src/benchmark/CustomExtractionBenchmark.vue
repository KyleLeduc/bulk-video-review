<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import {
  runExtractionBenchmark,
  type ExtractionReport,
  type ExtractionRow,
  type ExtractionBackend,
} from './runExtractionBenchmark'

const props = defineProps<{ build: BuildIdentity; capable: boolean }>()
const emit = defineEmits<{ active: [value: boolean] }>()
const files = shallowRef<File[]>([])
const selectionId = ref('')
const repetitions = ref(3)
const acknowledged = ref(false)
const active = ref(false)
const progress = ref('Choose local files to begin')
const rows = shallowRef<ExtractionRow[]>([])
const result = shallowRef<ExtractionReport>()
const copyStatus = ref('')
const copying = ref(false)
const jsonText = ref<HTMLTextAreaElement>()
const samples = ref<{ backend: ExtractionBackend; urls: string[] }[]>([])
const samplePair = ref('')
let controller: AbortController | undefined
let disposed = false
const exported = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : '',
)
const canStart = computed(
  () =>
    props.capable &&
    files.value.length > 0 &&
    acknowledged.value &&
    !active.value &&
    Number.isInteger(repetitions.value) &&
    repetitions.value >= 1 &&
    repetitions.value <= 5,
)
function releaseSamples() {
  for (const sample of samples.value)
    for (const url of sample.urls) URL.revokeObjectURL(url)
  samples.value = []
  samplePair.value = ''
}
function select(event: Event) {
  releaseSamples()
  files.value = Array.from((event.target as HTMLInputElement).files ?? [])
  selectionId.value = crypto.randomUUID()
  rows.value = []
  result.value = undefined
  copyStatus.value = ''
}
function stop() {
  controller?.abort()
}
const beforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault()
  event.returnValue = ''
}
async function start() {
  if (!canStart.value) return
  releaseSamples()
  rows.value = []
  result.value = undefined
  copyStatus.value = ''
  controller = new AbortController()
  active.value = true
  emit('active', true)
  window.addEventListener('beforeunload', beforeUnload)
  try {
    const report = await runExtractionBenchmark({
      files: files.value,
      selectionId: selectionId.value,
      repetitions: repetitions.value,
      build: props.build,
      signal: controller.signal,
      onProgress: (message) => {
        if (!disposed) progress.value = message
      },
      onRow: (row, output) => {
        if (disposed) return
        rows.value = [...rows.value, row]
        const pair = `Video ${row.file} · repetition ${row.repetition}`
        if (samplePair.value !== pair) {
          releaseSamples()
          samplePair.value = pair
        }
        if (output) {
          const urls: string[] = []
          try {
            for (const blob of output.frames)
              urls.push(URL.createObjectURL(blob))
            samples.value = [...samples.value, { backend: row.backend, urls }]
          } catch (error) {
            for (const url of urls) URL.revokeObjectURL(url)
            throw error
          }
        }
      },
    })
    if (!disposed) {
      result.value = report
      progress.value =
        report.status +
        (report.hidden ? ' — tab was hidden; exclude this run' : '')
    }
  } catch {
    if (!disposed)
      progress.value =
        'Could not start comparison. Close other benchmark tabs and check browser capabilities.'
  } finally {
    active.value = false
    emit('active', false)
    window.removeEventListener('beforeunload', beforeUnload)
  }
}
async function copyJson() {
  if (!result.value || active.value || copying.value) return
  const source = result.value
  const text = exported.value
  copying.value = true
  copyStatus.value = ''
  try {
    await navigator.clipboard.writeText(text)
    if (!disposed && result.value === source) copyStatus.value = 'JSON copied'
  } catch {
    if (disposed || result.value !== source) return
    jsonText.value?.focus()
    jsonText.value?.select()
    copyStatus.value = 'Copy the selected JSON with Ctrl+C / Cmd+C'
  } finally {
    copying.value = false
  }
}
onBeforeUnmount(() => {
  disposed = true
  stop()
  releaseSamples()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <section aria-labelledby="extraction-heading">
    <h2 id="extraction-heading">Custom files: DOM vs Mediabunny</h2>
    <p>
      Preview extraction only — not ingestion, persistence or the earlier 2/1
      and 2/2 pipeline tests. No fixtures needed.
    </p>
    <p class="warning">
      Experimental: use files you trust. Parser and browser memory are not
      hard-capped; very large or malformed media could freeze or crash the tab.
      A disposable worker, best-effort read limits and a 120-second job deadline
      reduce risk, but cannot prevent every allocation. Keep this tab visible;
      hiding it cancels and invalidates the run.
    </p>
    <fieldset :disabled="active">
      <legend>Comparison settings</legend>
      <label
        >Local videos
        <input
          data-test="extraction-files"
          type="file"
          multiple
          accept="video/*,.mp4,.m4v,.mov"
          @change="select"
      /></label>
      <p>
        {{ files.length }} files selected. Candidate currently supports
        MP4/H.264 with browser WebCodecs; unsupported files are reported, never
        silently retried with DOM.
      </p>
      <label
        >Repetitions
        <input
          v-model.number="repetitions"
          data-test="extraction-repetitions"
          type="number"
          min="1"
          max="5"
          step="1"
      /></label>
      <label
        ><input v-model="acknowledged" data-test="memory-ack" type="checkbox" />
        I understand the experimental memory limits.</label
      >
    </fieldset>
    <p>
      One file/method runs at a time. Method order alternates each repetition.
      Both use the same nine DOM-derived target times, JPEG quality 0.72 and
      maximum width 480 (no upscaling). DOM metadata preparation is recorded
      separately, outside extraction timing. Jobs include fresh media/worker
      startup, loading, seeking/decoding and encoding. Browser and OS caches
      remain shared; no saved app previews are reused.
    </p>
    <div class="controls">
      <button data-test="extraction-start" :disabled="!canStart" @click="start">
        Start comparison
      </button>
      <button data-test="extraction-stop" :disabled="!active" @click="stop">
        Cancel comparison
      </button>
      <button
        data-test="extraction-copy"
        :disabled="!result || active || copying"
        @click="copyJson"
      >
        Copy JSON
      </button>
    </div>
    <p role="status" data-test="extraction-status">
      {{ progress }} · {{ rows.length }} jobs recorded
    </p>
    <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
    <p v-if="result?.errors.length" role="alert">
      Sample display failed; numeric evidence is retained below.
    </p>
    <p>
      Files and sample images stay local. JSON includes selection ID, file
      ordinals and exact byte sizes, build/browser identity, timings and
      counters — no names, paths, video bytes, content hashes or target
      timestamps. Exact sizes can still be identifying; this is minimized
      metadata, not guaranteed anonymity.
    </p>
    <div class="table-scroll" v-if="rows.length">
      <table>
        <thead>
          <tr>
            <th>Repeat</th>
            <th>Video</th>
            <th>Method</th>
            <th>Wall time</th>
            <th>Frames</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.order">
            <td>{{ row.repetition }}</td>
            <td>{{ row.file }}</td>
            <td>
              {{
                row.backend === 'dom'
                  ? 'DOM (current)'
                  : 'Mediabunny (candidate)'
              }}
            </td>
            <td>{{ (row.wallMs / 1000).toFixed(3) }} s</td>
            <td>{{ row.frames }}/9</td>
            <td>{{ row.status }} {{ row.reason ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <section v-if="samples.length">
      <h3>Local visual check: {{ samplePair }}</h3>
      <p>
        Only the latest pair is retained. A passed row confirms output count and
        shape, not identical pixels or frame choice. Compare the images; decoder
        seeking can choose adjacent frames.
      </p>
      <div v-for="sample in samples" :key="sample.backend">
        <h4>{{ sample.backend }}</h4>
        <div class="samples">
          <img
            v-for="(url, index) in sample.urls"
            :key="index"
            :src="url"
            :alt="`${sample.backend} preview ${index + 1}`"
          />
        </div>
      </div>
    </section>
    <label v-if="result"
      >Copyable JSON evidence<textarea
        ref="jsonText"
        data-test="extraction-json"
        readonly
        rows="12"
        :value="exported"
      />
    </label>
    <p>
      <a
        href="/third-party/mediabunny/index.html"
        target="_blank"
        rel="noopener"
        >Mediabunny 1.55.7 license, notices and corresponding source</a
      >. Memory and interaction-latency metrics are unavailable. No normal-app
      backend or concurrency setting is changed.
    </p>
  </section>
</template>

<style scoped>
fieldset,
.warning {
  padding: 1rem;
  border: 1px solid #ccd5df;
  border-radius: 8px;
  margin: 1rem 0;
}
.warning {
  background: #fff7e6;
  border-color: #bd8b20;
}
label {
  display: block;
  margin: 0.7rem 0;
}
button,
input,
textarea {
  font: inherit;
}
button {
  padding: 0.5rem;
}
.controls {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.table-scroll {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
}
td,
th {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid #ccd5df;
}
.samples {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
img {
  width: 100%;
}
textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
}
</style>
