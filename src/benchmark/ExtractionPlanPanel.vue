<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { BuildIdentity } from '../shared/benchmark/videoBenchmarkProtocol'
import { planSteps, type ExtractionPreset } from './extractionPlans'
import {
  CLIP_FPS,
  CLIP_SECONDS,
  type ClipSeconds,
  type ClipFrameRate,
} from '../infrastructure/video/benchmark/clipExtraction'
import {
  runExtractionPlan,
  type ExtractionPlanReport,
  type PlanResult,
} from './runExtractionBenchmark'

const props = withDefaults(
  defineProps<{
    files: File[]
    selectionId: string
    build: BuildIdentity
    disabled: boolean
    busy: boolean
    visible?: boolean
  }>(),
  { visible: true },
)
const emit = defineEmits<{ active: [value: boolean] }>()
const preset = ref<ExtractionPreset>('clips-duration-v1')
const running = ref(false)
const progress = ref('Ready')
const elapsed = ref(0)
const completed = shallowRef<PlanResult[]>([])
const result = shallowRef<ExtractionPlanReport>()
const jsonText = ref<HTMLTextAreaElement>()
const copyStatus = ref('')
type ClipVariant = {
  file: number
  frameRate: ClipFrameRate
  clipSeconds: ClipSeconds
  clips: { url: string; start: number; duration: number }[]
}
const variants = ref<ClipVariant[]>([])
const variantIndex = ref(0)
const clipIndex = ref(0)
const video = ref<HTMLVideoElement>()
const playbackPaused = ref(false)
const playbackError = ref('')
const activeVariant = computed(() => variants.value[variantIndex.value])
const activeClip = computed(() => activeVariant.value?.clips[clipIndex.value])
const isClipPlan = computed(() => preset.value.startsWith('clips-'))
const steps = computed(() => planSteps(preset.value))
const exported = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : '',
)
let controller: AbortController | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
let downloadUrl: string | undefined
let playbackAttempt = 0
function releaseClips() {
  playbackAttempt++
  if (video.value) {
    video.value.pause()
    video.value.removeAttribute('src')
    video.value.load()
  }
  for (const variant of variants.value)
    for (const clip of variant.clips) URL.revokeObjectURL(clip.url)
  variants.value = []
  variantIndex.value = clipIndex.value = 0
  playbackError.value = ''
}
async function playCurrent() {
  const player = video.value
  const source = activeClip.value?.url
  if (!player || !source || playbackPaused.value || !props.visible) return
  const attempt = ++playbackAttempt
  try {
    player.muted = true
    await player.play()
  } catch {
    if (
      disposed ||
      attempt !== playbackAttempt ||
      source !== activeClip.value?.url ||
      playbackPaused.value ||
      !props.visible
    )
      return
    playbackPaused.value = true
    playbackError.value =
      'Playback did not start. Use Resume previews to try again.'
  }
}
watch(
  () => activeClip.value?.url,
  () => {
    playbackAttempt++
    if (!video.value || !activeClip.value) return
    video.value.pause()
    video.value.load()
    void playCurrent()
  },
  { flush: 'post' },
)
function advanceClip() {
  if (playbackPaused.value || !activeVariant.value || !props.visible) return
  clipIndex.value = (clipIndex.value + 1) % activeVariant.value.clips.length
  if (activeVariant.value.clips.length === 1) {
    if (video.value) video.value.currentTime = 0
    void playCurrent()
  }
}
function selectVariant() {
  clipIndex.value = 0
  playbackError.value = ''
}
function togglePlayback() {
  playbackAttempt++
  playbackPaused.value = !playbackPaused.value
  playbackError.value = ''
  if (playbackPaused.value) video.value?.pause()
  else {
    if (video.value?.error) video.value.load()
    void playCurrent()
  }
}
function reportPlaybackError() {
  playbackAttempt++
  video.value?.pause()
  playbackPaused.value = true
  playbackError.value =
    'This clip could not be played. Try Resume previews or another variant.'
}
function reset() {
  releaseClips()
  result.value = undefined
  completed.value = []
  copyStatus.value = ''
}
watch(() => props.selectionId, reset)
watch(
  () => props.visible,
  (visible) => {
    playbackAttempt++
    if (!visible) video.value?.pause()
    else void playCurrent()
  },
  { flush: 'post' },
)
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
  playbackPaused.value =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
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
      onClipSample: (sample, step) => {
        if (disposed) return
        const clips: ClipVariant['clips'] = []
        try {
          if (variants.value.length >= 4) throw new Error('Sample limit')
          for (const clip of sample.output.clips)
            clips.push({
              url: URL.createObjectURL(clip.blob),
              start: clip.start,
              duration: clip.duration,
            })
          variants.value.push({
            file: sample.file,
            frameRate: step.frameRate ?? CLIP_FPS,
            clipSeconds: step.clipSeconds ?? CLIP_SECONDS,
            clips,
          })
        } catch (error) {
          for (const clip of clips) URL.revokeObjectURL(clip.url)
          throw error
        }
      },
    })
    if (!disposed) {
      result.value = report
      progress.value = `${report.status}${report.hidden ? ' — browser tab hidden; restart to run again. Partial results retained.' : ''}`
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
        <option value="clips-duration-v1">
          Clip duration: 0.5 / 1 / 1.5 / 2 s · 20 FPS
        </option>
        <option value="clips-quality-v1">
          Clip quality: 10 / 20 / 24 / 30 FPS
        </option>
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
      {{ steps.length }} configurations on the selected files. This preset owns
      its settings; Manual config does not apply. Keep the browser tab visible.
      Stop retains partial results.
    </p>
    <p v-if="isClipPlan">
      Try one or two files: up to ten clips per video, muted, 320 px, 250
      kbit/s, one job.
      {{
        preset === 'clips-duration-v1'
          ? 'Compare 0.5, 1, 1.5 and 2 seconds at 20 FPS, with matching source positions.'
          : preset === 'clips-quality-v1'
            ? 'Compare motion at 10, 20, 24 and 30 FPS.'
            : 'Original 10 FPS baseline.'
      }}
      <template v-if="preset !== 'clips-duration-v1'"
        >3 seconds per clip.</template
      >
      Previews appear after the plan finishes.
    </p>
    <details>
      <summary>Preset details and limits</summary>
      <p v-if="isClipPlan">
        AVC/MP4 output, or VP8/WebM if AVC encoding is unavailable. Buffered 1
        MiB reads; 1 GiB read limit per file; 2 MiB per clip, 16 MiB output per
        file; 120-second file deadline. Quality comparisons retain at most four
        samples (64 MiB encoded output). These are not parser/decoder memory
        caps. FPS is a conversion target, not proof of distinct source frames.
      </p>
      <p v-else>
        Still plans use reversed passes, one repetition per configuration, and
        the buffered 1 MiB reader. The full matrix can take tens of minutes.
      </p>
    </details>
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
        <caption>
          {{
            entry.step.id
          }}
        </caption>
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
    <details v-if="completed.some((entry) => entry.step.workload === 'clips')">
      <summary>Timing notes</summary>
      <p>
        *First encoded clip is measured inside the worker, not first visible
        playback. Clip timings include metadata setup and cannot be directly
        compared with still-only batches. Decode, encode and muxing overlap
        within conversion; reads are nested. Playback is deferred until the plan
        ends.
      </p>
    </details>
    <section
      v-if="activeVariant && activeClip && !running"
      data-test="clip-samples"
    >
      <h4>
        Motion preview — {{ activeVariant.clipSeconds }} s ·
        {{ activeVariant.frameRate }} FPS · video
        {{ activeVariant.file }}
      </h4>
      <label v-if="variants.length > 1"
        >Variant
        <select
          v-model.number="variantIndex"
          data-test="clip-variant"
          @change="selectVariant"
        >
          <option
            v-for="(variant, index) in variants"
            :key="index"
            :value="index"
          >
            {{ variant.clipSeconds }} s · {{ variant.frameRate }} FPS · video
            {{ variant.file }}
          </option>
        </select>
      </label>
      <p>
        Latest successful file per variant. Compare the file number if a variant
        had failures.
      </p>
      <figure>
        <video
          ref="video"
          :src="activeClip.url"
          muted
          :autoplay="!playbackPaused && visible"
          playsinline
          disablepictureinpicture
          disableremoteplayback
          tabindex="-1"
          preload="auto"
          :aria-label="`Motion preview ${clipIndex + 1}`"
          @ended="advanceClip"
          @loadeddata="playCurrent"
          @error="reportPlaybackError"
        />
        <figcaption>
          Clip {{ clipIndex + 1 }} / {{ activeVariant.clips.length }} ·
          {{ activeClip.start.toFixed(1) }} s ·
          {{ activeClip.duration.toFixed(1) }} s window
        </figcaption>
      </figure>
      <button data-test="clip-playback" @click="togglePlayback">
        {{ playbackPaused ? 'Resume previews' : 'Pause previews' }}
      </button>
      <p v-if="playbackError" role="status">{{ playbackError }}</p>
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
  pointer-events: none;
  display: block;
  max-width: 320px;
  max-height: 320px;
  background: #000;
}
</style>
