<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  orderFixtureFiles,
  summarize,
  validatePipelineSuite,
  type BuildIdentity,
} from '../shared/benchmark/videoBenchmarkProtocol'
import reference from '../shared/benchmark/referenceFixtures.json'
import { isBrowserPlayableVideoFile } from '../shared/video/browserPlayableVideoTypes'
import {
  runVideoBenchmarkSuite,
  type BenchmarkSuite,
} from './runVideoBenchmarkSuite'
import type { TrialRow } from './videoBenchmarkHost'

const props = defineProps<{ build: BuildIdentity; capable: boolean }>()
const files = shallowRef<File[]>([])
const selectionError = ref('')
const ignored = ref(0)
const foreground = ref('2')
const previews = ref('1')
const repetitions = ref(5)
const includeCached = ref(true)
const active = ref(false)
const stopping = ref(false)
const mount = ref<HTMLElement>()
const rows = shallowRef<TrialRow[]>([])
const result = shallowRef<BenchmarkSuite | null>(null)
const images = ref<string[]>([])
const failure = ref('')
const validSettings = computed(
  () =>
    Number.isInteger(repetitions.value) &&
    repetitions.value >= 1 &&
    repetitions.value <= 5,
)
const canStart = computed(
  () =>
    props.capable &&
    files.value.length === reference.files.length &&
    validSettings.value &&
    !active.value,
)
const evidenceErrors = computed(() =>
  result.value ? validatePipelineSuite(result.value, reference) : [],
)
const status = computed(() =>
  active.value
    ? 'running'
    : result.value?.status ?? (failure.value ? 'failed' : 'ready'),
)
const exported = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : '',
)
const summaries = computed(() => {
  if (!result.value || evidenceErrors.value.length) return []
  const groups = new Map<string, number[]>()
  for (const row of result.value.rows) {
    const c = row.configuration
    const key = `${c.backend} · ${c.foreground}/${c.previews} · ${c.cache === 'cold' ? 'fresh' : 'cached'}`
    const values = groups.get(key) ?? []
    if (row.wallMs !== null) values.push(row.wallMs)
    groups.set(key, values)
  }
  return [...groups].map(([label, values]) => ({ label, ...summarize(values) }))
})
const seconds = (value: number | null) =>
  value === null ? 'unavailable' : `${(value / 1000).toFixed(3)} s`

function select(event: Event) {
  if (active.value) return
  files.value = []
  selectionError.value = ''
  const selected = Array.from((event.target as HTMLInputElement).files ?? [])
  const media = selected.filter(isBrowserPlayableVideoFile)
  ignored.value = selected.length - media.length
  try {
    files.value = orderFixtureFiles(media, reference)
  } catch (error) {
    selectionError.value =
      error instanceof Error ? error.message : 'Invalid fixture selection'
  }
}
function setImages(blobs: Blob[]) {
  for (const url of images.value) URL.revokeObjectURL(url)
  images.value = blobs.map((blob) => URL.createObjectURL(blob))
}
async function start() {
  if (!canStart.value || !mount.value) return
  active.value = true
  stopping.value = false
  result.value = null
  rows.value = []
  failure.value = ''
  const configurations = (
    foreground.value === 'all' ? [1, 2, 4] : [Number(foreground.value)]
  ).flatMap((fg) =>
    (previews.value === 'all' ? [1, 2] : [Number(previews.value)]).map(
      (bg) => ({ backend: 'dom', foreground: fg, previews: bg }),
    ),
  )
  try {
    result.value = await runVideoBenchmarkSuite({
      files: files.value,
      configurations,
      repetitions: repetitions.value,
      includeCached: includeCached.value,
      build: props.build,
      mount: mount.value,
      stopRequested: () => stopping.value,
      onRow: (row) => {
        rows.value = [...rows.value, row]
      },
      onImages: setImages,
    })
    if (
      result.value.status === 'completed' &&
      validatePipelineSuite(result.value, reference).length
    )
      result.value = {
        ...result.value,
        status: 'failed',
        errors: [
          ...result.value.errors,
          'Suite evidence is incomplete or unqualified; inspect validation reasons',
        ],
      }
  } catch (error) {
    failure.value = error instanceof Error ? error.message : 'Benchmark failed'
  } finally {
    active.value = false
  }
}
function download() {
  if (!result.value) return
  const url = URL.createObjectURL(
    new Blob([exported.value], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'bvr-pipeline-benchmark-v2.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (active.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  stopping.value = true
  setImages([])
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <main>
    <header>
      <a href="/">← Back to review</a>
      <h1>Video benchmark</h1>
      <p>
        Repeatable local trials of the real ingestion and thumbnail pipeline,
        without the gallery.
      </p>
    </header>
    <p class="notice">
      Your selected videos stay in this browser; no video upload. Trials use
      temporary benchmark databases, not your saved catalog. Keep this tab
      visible and close competing app tabs and heavy work.
    </p>
    <p v-if="!capable" role="alert">
      Use current Chrome or Edge over HTTPS (or localhost), with IndexedDB, Web
      Locks, DataTransfer and image decoding available.
    </p>
    <fieldset :disabled="active">
      <legend>Fixed reference fixtures</legend>
      <label
        >Choose the prepared fixture folder
        <input
          data-test="fixture-files"
          type="file"
          multiple
          webkitdirectory
          @change="select"
      /></label>
      <p>
        {{ reference.id }} · {{ files.length }} /
        {{ reference.files.length }} media selected ·
        <strong>selection-only</strong> verification.
      </p>
      <p>
        Names, sizes, paths and multiplicity are checked; content hashes are not
        computed in this page. The CLI verifies full SHA-256 separately.
        Metadata files and archives are ignored ({{ ignored }}).
      </p>
      <p v-if="selectionError" role="alert">{{ selectionError }}</p>
      <details>
        <summary>Fixture manifest and attribution</summary>
        <ul>
          <li v-for="file in reference.files" :key="file.path">
            {{ file.path }} — {{ file.bytes }} bytes
            <small>Expected SHA-256: {{ file.sha256 }}</small>
          </li>
        </ul>
        <p>
          {{ reference.attribution.author }} ·
          <a :href="reference.attribution.licenseUrl">{{
            reference.attribution.license
          }}</a
          >. {{ reference.attribution.derivatives }}
        </p>
      </details>
    </fieldset>
    <fieldset :disabled="active">
      <legend>Sequential suite</legend>
      <p>Backend: DOM (existing pipeline). WebCodecs: not implemented.</p>
      <div class="controls">
        <label
          >Ingestion concurrency
          <select v-model="foreground" data-test="foreground">
            <option>1</option>
            <option>2</option>
            <option>4</option>
            <option value="all">All (1, 2, 4)</option>
          </select></label
        >
        <label
          >Preview concurrency
          <select v-model="previews" data-test="previews">
            <option>1</option>
            <option>2</option>
            <option value="all">All (1, 2)</option>
          </select></label
        >
        <label
          >Repetitions
          <input
            v-model.number="repetitions"
            data-test="repetitions"
            type="number"
            min="1"
            max="5"
            step="1"
        /></label>
        <label
          ><input v-model="includeCached" data-test="cached" type="checkbox" />
          Follow each fresh trial with a cached trial</label
        >
      </div>
      <p>
        Fresh means a new database and host. Cached reuses the pair’s database
        in a new host. Browser and OS caches are shared. This is not comparable
        to the old full-gallery baseline.
      </p>
    </fieldset>
    <div class="controls">
      <button data-test="start" :disabled="!canStart" @click="start">
        Start suite</button
      ><button
        data-test="stop"
        :disabled="!active || stopping"
        @click="stopping = true"
      >
        Stop after current trial</button
      ><button :disabled="!result || active" @click="download">
        Download JSON
      </button>
    </div>
    <p role="status" data-test="suite-status">
      {{ status }} · {{ rows.length }} trials recorded
      <span v-if="stopping && active"
        >· stopping after settlement and cleanup</span
      >
    </p>
    <p v-if="failure" role="alert">{{ failure }}</p>
    <div ref="mount" data-test="trial-mount"></div>
    <section v-if="rows.length">
      <h2>Trial results</h2>
      <table>
        <thead>
          <tr>
            <th>Repeat</th>
            <th>DOM ingestion/previews</th>
            <th>Cache</th>
            <th>Pipeline wall time</th>
            <th>Outputs</th>
            <th>Status / cleanup</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td>{{ row.configuration.repetition }}</td>
            <td>
              {{ row.configuration.foreground }}/{{
                row.configuration.previews
              }}
            </td>
            <td>
              {{ row.configuration.cache === 'cold' ? 'fresh' : 'cached' }}
            </td>
            <td>{{ seconds(row.wallMs) }}</td>
            <td>
              {{ row.outputs?.videos ?? '—' }} videos /
              {{ row.outputs?.frames ?? '—' }} frames
            </td>
            <td>
              {{ row.status }} / {{ row.cleanup
              }}<small>{{ row.errors.join('; ') }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="result">
      <h2>Suite evidence</h2>
      <p v-if="evidenceErrors.length" role="alert">
        Not a complete comparable suite:
        {{ [...new Set(evidenceErrors)].join('; ') }}
      </p>
      <p v-for="summary in summaries" :key="summary.label">
        {{ summary.label }} · {{ summary.count }} trials · median
        {{ seconds(summary.median) }} · range {{ seconds(summary.min) }}–{{
          seconds(summary.max)
        }}
      </p>
      <p v-if="result.orphanedPairs.length" role="alert">
        Cleanup unresolved for owned pair IDs:
        {{ result.orphanedPairs.join(', ') }}. Stop here; no catalog wipe is
        needed.
      </p>
      <details>
        <summary>JSON evidence (no media bytes or local file paths)</summary>
        <textarea
          data-test="result-json"
          readonly
          :value="exported"
          rows="12"
          aria-label="Benchmark JSON evidence"
        ></textarea>
      </details>
    </section>
    <section v-if="images.length">
      <h2>Latest completed output inspection</h2>
      <p>
        Nine previews per video. These images are checked after timing and
        released before the next trial.
      </p>
      <div class="images">
        <figure v-for="(image, index) in images" :key="image">
          <img
            :src="image"
            :alt="`Video ${Math.floor(index / 9) + 1}, preview ${(index % 9) + 1}`"
          />
          <figcaption>
            Video {{ Math.floor(index / 9) + 1 }} · {{ (index % 9) + 1 }}/9
          </figcaption>
        </figure>
      </div>
    </section>
    <footer>
      <p>
        Memory / native decoder metrics: unavailable. Interaction latency:
        unavailable. Phase timings in JSON are overlapping operation totals, not
        percentages of wall time.
      </p>
      <p>
        Build {{ build.revision ?? 'unknown' }} ·
        {{ build.source ?? 'local' }} · dirty:
        {{ build.dirty === null ? 'unknown' : build.dirty }}. A revision alone
        is not CI provenance; local/dev results are not a qualified release
        baseline.
      </p>
      <p>
        Deadlines: startup 15 s · trial including post-timing checks 120 s ·
        cleanup 10 s. Stop does not cancel foreground work. Closing the tab
        early can leave an owned temporary database; it cannot roll back
        accepted writes.
      </p>
    </footer>
  </main>
</template>

<style scoped>
main {
  max-width: 1100px;
  margin: 2rem auto;
  padding: 0 1rem;
  font:
    16px/1.5 system-ui,
    sans-serif;
  color: #1f2937;
}
h1 {
  font-size: 2rem;
  margin-bottom: 0.4rem;
}
h2 {
  font-size: 1.25rem;
}
a {
  color: #1755a6;
}
fieldset,
.notice {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #ccd5df;
  border-radius: 8px;
}
.notice {
  background: #f1f6fc;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
label {
  display: grid;
  gap: 0.3rem;
}
input,
select,
button,
textarea {
  font: inherit;
}
button,
select,
input[type='number'] {
  padding: 0.45rem 0.65rem;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9rem;
}
th,
td {
  border-bottom: 1px solid #ddd;
  text-align: left;
  padding: 0.6rem;
}
small {
  display: block;
  overflow-wrap: anywhere;
}
textarea {
  width: 100%;
  box-sizing: border-box;
}
[role='alert'] {
  color: #9d2727;
}
footer {
  margin-top: 2rem;
  font-size: 0.85rem;
  color: #586270;
}
.images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 0.7rem;
}
figure {
  margin: 0;
}
img {
  width: 100%;
  height: 100px;
  object-fit: contain;
  background: #e9edf1;
}
figcaption {
  font-size: 0.8rem;
}
</style>
