<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import { planSteps, type ExtractionPreset } from './extractionPlans'
import {
  runExtractionPlan,
  type ExtractionPlanReport,
  type PlanResult,
} from './runExtractionBenchmark'

const props = defineProps<{
  files: File[]
  selectionId: string
  build: BuildIdentity
  disabled: boolean
  busy: boolean
}>()
const emit = defineEmits<{ active: [value: boolean] }>()
const preset = ref<ExtractionPreset>('clips-3s-v1')
const running = ref(false)
const progress = ref('Choose a preset; manual settings do not affect plans.')
const elapsed = ref(0)
const completed = shallowRef<PlanResult[]>([])
const result = shallowRef<ExtractionPlanReport>()
const jsonText = ref<HTMLTextAreaElement>()
const copyStatus = ref('')
const clips = ref<{ url: string; start: number; duration: number }[]>([])
const sampleFile = ref(0)
const videos = ref<HTMLElement>()
const steps = computed(() => planSteps(preset.value))
const exported = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : '',
)
let controller: AbortController | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
let downloadUrl: string | undefined
function releaseClips() {
  for (const video of videos.value?.querySelectorAll('video') ?? []) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  for (const clip of clips.value) URL.revokeObjectURL(clip.url)
  clips.value = []
}
function reset() {
  releaseClips()
  result.value = undefined
  completed.value = []
  copyStatus.value = ''
}
watch(() => props.selectionId, reset)
watch(
  () => props.busy,
  (busy) => {
    if (busy && !running.value) releaseClips()
  },
)
function stop() {
  controller?.abort()
}
function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}
async function start() {
  if (props.disabled || props.busy || running.value) return
  reset()
  controller = new AbortController()
  running.value = true
  emit('active', true)
  const started = performance.now()
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = (performance.now() - started) / 1000
  }, 500)
  window.addEventListener('beforeunload', beforeUnload)
  try {
    const report = await runExtractionPlan({
      files: [...props.files],
      selectionId: props.selectionId,
      build: props.build,
      preset: preset.value,
      signal: controller.signal,
      onProgress: (message) => {
        if (!disposed) progress.value = message
      },
      onStep: (entry) => {
        if (!disposed) completed.value = [...completed.value, entry]
      },
      onClipSample: (sample) => {
        if (disposed) return
        releaseClips()
        try {
          for (const clip of sample.output.clips)
            clips.value.push({
              url: URL.createObjectURL(clip.blob),
              start: clip.start,
              duration: clip.duration,
            })
          sampleFile.value = sample.file
        } catch (error) {
          releaseClips()
          throw error
        }
      },
    })
    if (!disposed) {
      result.value = report
      progress.value = `${report.status}${report.hidden ? ' — hidden tab; exclude this plan' : ''}`
    }
  } catch {
    if (!disposed)
      progress.value =
        'Could not start plan. Check browser capabilities and close other active benchmark tabs.'
  } finally {
    clearInterval(timer)
    window.removeEventListener('beforeunload', beforeUnload)
    elapsed.value = (performance.now() - started) / 1000
    running.value = false
    if (!disposed) emit('active', false)
  }
}
async function copyAll() {
  if (!result.value || running.value || props.busy) return
  const source = result.value
  try {
    await navigator.clipboard.writeText(exported.value)
    if (!disposed && source === result.value)
      copyStatus.value = 'All JSON copied'
  } catch {
    if (disposed || source !== result.value) return
    jsonText.value?.focus()
    jsonText.value?.select()
    copyStatus.value = 'Copy the selected JSON with Ctrl+C / Cmd+C'
  }
}
function download() {
  if (!result.value || running.value || props.busy) return
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = URL.createObjectURL(
    new Blob([exported.value], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = `bvr-${result.value.preset}-results.json`
  link.click()
}
function playOne(event: Event) {
  for (const video of videos.value?.querySelectorAll('video') ?? [])
    if (video !== event.target) video.pause()
}
function seconds(ms: number) {
  return `${(ms / 1000).toFixed(2)} s`
}
function batchTime(entry: PlanResult) {
  return entry.report.mode === 'clip-extraction-custom-v1'
    ? entry.report.wallMs
    : entry.report.batches.reduce((n, batch) => n + batch.wallMs, 0)
}
onBeforeUnmount(() => {
  disposed = true
  stop()
  clearInterval(timer)
  releaseClips()
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <section class="plan" aria-labelledby="plan-heading">
    <h3 id="plan-heading">Automatic test plan</h3>
    <label
      >Preset
      <select
        v-model="preset"
        data-test="plan-preset"
        :disabled="running || busy"
      >
        <option value="clips-3s-v1">
          Three-second clips: smoke v1 (1 job)
        </option>
        <option value="confirmation-v1">
          Short confirmation v1 (9 stills, 4 jobs, reversed passes)
        </option>
        <option value="still-matrix-v1">
          Full still matrix v1 (9/100 stills, 2/4 jobs, reversed passes)
        </option>
      </select>
    </label>
    <p>
      {{ steps.length }} configurations, sequentially on the same selection.
      Still plans use two reversed passes, one repetition per step and the
      buffered 1 MiB reader. The full matrix can take tens of minutes on a NAS.
      Keep this tab visible; Stop retains partial numeric evidence.
    </p>
    <p v-if="preset === 'clips-3s-v1'">
      Start with a few files. Up to ten evenly spaced three-second muted loops
      per video; fewer on short videos. 10 fps, longest side at most 320 pixels,
      250 kbit/s target. AVC/MP4 when encodable, otherwise VP8/WebM. Sequential
      clips, one file worker; 1 GiB cumulative reads, 2 MiB per clip / 16 MiB
      total output, 120-second file deadline. No hard parser/decoder memory cap.
    </p>
    <div class="controls">
      <button
        data-test="plan-start"
        :disabled="disabled || busy || running"
        @click="start"
      >
        Run test plan
      </button>
      <button data-test="plan-stop" :disabled="!running" @click="stop">
        Stop plan
      </button>
      <button
        data-test="plan-copy"
        :disabled="!result || running || busy"
        @click="copyAll"
      >
        Copy all JSON
      </button>
      <button
        data-test="plan-download"
        :disabled="!result || running || busy"
        @click="download"
      >
        Download results
      </button>
    </div>
    <p role="status" data-test="plan-status">
      {{ progress }} · {{ completed.length }} configurations recorded ·
      {{ elapsed.toFixed(1) }} s elapsed
    </p>
    <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
    <p v-if="result?.errors.length" role="alert">
      Plan errors: {{ result.errors.join(', ') }}. Retained evidence is below;
      this is not a successful speed comparison.
    </p>
    <table v-if="completed.length" data-test="plan-summary">
      <thead>
        <tr>
          <th>Configuration</th>
          <th>Pass</th>
          <th>Batch elapsed</th>
          <th>Passed / recorded</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, index) in completed" :key="index">
          <td>{{ entry.step.id }}</td>
          <td>{{ entry.step.pass }}</td>
          <td>{{ seconds(batchTime(entry)) }}</td>
          <td>
            {{
              entry.report.rows.filter((row) => row.status === 'passed').length
            }}
            / {{ entry.report.rows.length }}
          </td>
          <td>{{ entry.report.status }}</td>
        </tr>
      </tbody>
    </table>
    <template v-for="(entry, index) in completed" :key="index">
      <table
        v-if="entry.report.mode === 'clip-extraction-custom-v1'"
        data-test="clip-summary"
      >
        <thead>
          <tr>
            <th>Video</th>
            <th>Clips</th>
            <th>Codec</th>
            <th>First encoded clip*</th>
            <th>File wall</th>
            <th>Output</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in entry.report.rows" :key="row.file">
            <td>{{ row.file }}</td>
            <td>{{ row.clips }}</td>
            <td>{{ row.codec ?? '—' }}</td>
            <td>{{ row.metrics ? seconds(row.metrics.firstClipMs) : '—' }}</td>
            <td>{{ seconds(row.wallMs) }}</td>
            <td>{{ (row.outputBytes / 1024).toFixed(1) }} KiB</td>
            <td>{{ row.status }} {{ row.reason ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-if="preset === 'clips-3s-v1'">
      *First encoded clip is measured inside the worker, not first visible
      playback. Clip timings include metadata setup and cannot be directly
      compared with still-only batches. Decode, encode and muxing overlap within
      conversion; reads are nested. Playback is deferred until the plan ends.
    </p>
    <section
      v-if="clips.length && !running"
      ref="videos"
      data-test="clip-samples"
    >
      <h4>Local looping previews — video {{ sampleFile }}</h4>
      <p>
        Latest successful file only. Press Play to inspect; starting one pauses
        the others. A passed row validates output shape, not visual correctness.
      </p>
      <div class="clips">
        <figure v-for="(clip, index) in clips" :key="clip.url">
          <video
            :src="clip.url"
            muted
            loop
            playsinline
            controls
            preload="metadata"
            :aria-label="`Looping preview ${index + 1}`"
            @play="playOne"
          />
          <figcaption>
            {{ clip.start.toFixed(1) }} s · {{ clip.duration.toFixed(1) }} s
            window
          </figcaption>
        </figure>
      </div>
    </section>
    <label v-if="result"
      >All plan results (JSON)<textarea
        ref="jsonText"
        data-test="plan-json"
        readonly
        rows="10"
        :value="exported"
      />
    </label>
    <p>
      Exports include exact file sizes, ordinals, codec choice and counters, but
      no filenames, paths, tags, source timestamps or media. Those metadata can
      still be identifying. Clips stay local; embedded source tags are not
      copied.
    </p>
  </section>
</template>

<style scoped>
.plan {
  border: 1px solid #ccd5df;
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
  overflow-x: auto;
}
.controls,
.clips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
button,
select,
textarea {
  font: inherit;
}
button {
  padding: 0.5rem;
}
textarea {
  display: block;
  width: 100%;
}
table {
  border-collapse: collapse;
  margin: 1rem 0;
}
td,
th {
  text-align: left;
  padding: 0.5rem;
  border: 1px solid #ccd5df;
}
figure {
  margin: 0;
}
video {
  display: block;
  max-width: 320px;
  max-height: 320px;
  background: #000;
}
</style>
