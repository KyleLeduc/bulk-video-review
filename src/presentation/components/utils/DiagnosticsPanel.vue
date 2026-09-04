<template>
  <section class="panel" v-if="isDiagnosticsPanelOpen">
    <nav>
      <h1>Diagnostics Panel</h1>
      <button @click="handleCloseClicked">❌</button>
    </nav>
    <section class="panel-section">
      <h2>Foreground ingestion</h2>
      <p v-if="displayedIngestionProgress">
        {{ displayedIngestionProgress.completedCount }} /
        {{ displayedIngestionProgress.total }}
        complete · {{ phaseLabel }}
      </p>
      <p v-else>No ingestion run recorded.</p>
      <dl v-if="displayedIngestionProgress" class="stats-list">
        <div>
          <dt>Active jobs</dt>
          <dd>{{ displayedIngestionProgress.activeItemCount ?? 0 }}</dd>
        </div>
        <div>
          <dt>Pending jobs</dt>
          <dd>{{ displayedIngestionProgress.pendingItemCount ?? 0 }}</dd>
        </div>
        <div>
          <dt>Worker limit</dt>
          <dd data-testid="foreground-workers-used">
            {{ foregroundEffectiveJobs }}
          </dd>
        </div>
        <div>
          <dt>Peak active jobs</dt>
          <dd>{{ displayedIngestionProgress.peakActiveItemCount ?? 0 }}</dd>
        </div>
        <div>
          <dt>Avg wall time / video</dt>
          <dd data-testid="foreground-average-per-video">
            {{
              formatSecondsPerVideo(
                runReport?.foreground.timings.averageMsPerCompletedVideo,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>Completed / second</dt>
          <dd data-testid="foreground-videos-per-second">
            {{
              formatVideosPerSecond(
                runReport?.foreground.timings.completedVideosPerSecond,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>Existing</dt>
          <dd>{{ displayedIngestionProgress.existingCount }}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{{ displayedIngestionProgress.createdCount }}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{{ displayedIngestionProgress.failedCount }}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{{ displayedIngestionProgress.skippedCount ?? 0 }}</dd>
        </div>
      </dl>

      <label class="panel-label" for="ingestionConcurrency">
        Primary ingestion workers
      </label>
      <select
        id="ingestionConcurrency"
        :value="ingestionConcurrencySelection"
        @change="handleIngestionConcurrencyChange"
      >
        <option value="auto">Auto ({{ autoIngestionConcurrency }})</option>
        <option
          v-for="value in ingestionConcurrencyOptions"
          :key="value"
          :value="value"
        >
          {{ value }}
        </option>
      </select>
      <p class="muted">
        Current setting: {{ effectiveIngestionConcurrency }} workers. Applies to
        the next import.
      </p>
    </section>

    <section class="panel-section">
      <h2>Queue state</h2>
      <dl class="stats-list">
        <div>
          <dt>Queued imports</dt>
          <dd>{{ queuedIngestionCount }}</dd>
        </div>
        <div>
          <dt>Drain status</dt>
          <dd>{{ drainStatusLabel }}</dd>
        </div>
      </dl>
    </section>

    <section class="panel-section">
      <h2>Background previews</h2>
      <dl class="stats-list">
        <div>
          <dt>Queued</dt>
          <dd>{{ backgroundPreviewCounts.queued }}</dd>
        </div>
        <div>
          <dt>Processing</dt>
          <dd>{{ backgroundPreviewCounts.processing }}</dd>
        </div>
        <div>
          <dt>Ready</dt>
          <dd>{{ backgroundPreviewCounts.ready }}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{{ backgroundPreviewCounts.failed }}</dd>
        </div>
        <div>
          <dt>Worker limit</dt>
          <dd data-testid="thumbnail-workers-used">
            {{ runReport?.backgroundPreviews.concurrency.effective ?? '—' }}
          </dd>
        </div>
        <div>
          <dt>Peak active jobs</dt>
          <dd>{{ runReport?.backgroundPreviews.peakActiveJobs ?? 0 }}</dd>
        </div>
        <div>
          <dt>Output bytes</dt>
          <dd>{{ runReport?.backgroundPreviews.outputBytes ?? 0 }}</dd>
        </div>
        <div>
          <dt>Active avg / video</dt>
          <dd data-testid="thumbnail-average-per-video">
            {{
              formatSecondsPerVideo(
                runReport?.backgroundPreviews.timing.averageMsPerCompletedVideo,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>Handled / second</dt>
          <dd data-testid="thumbnail-videos-per-second">
            {{
              formatVideosPerSecond(
                runReport?.backgroundPreviews.timing.completedVideosPerSecond,
              )
            }}
          </dd>
        </div>
      </dl>

      <label class="panel-label" for="thumbnailConcurrency">
        Thumbnail workers
      </label>
      <select
        id="thumbnailConcurrency"
        :value="thumbnailConcurrencySelection"
        @change="handleThumbnailConcurrencyChange"
      >
        <option value="auto">Auto ({{ autoThumbnailConcurrency }})</option>
        <option
          v-for="value in thumbnailConcurrencyOptions"
          :key="value"
          :value="value"
        >
          {{ value }}
        </option>
      </select>
      <p class="muted">
        Current setting: {{ effectiveThumbnailConcurrency }} workers. Applies to
        the next import. Runs after primary ingestion.
      </p>
    </section>

    <section class="panel-section">
      <h2>Run report</h2>
      <template v-if="runReport">
        <button
          type="button"
          data-testid="copy-ingestion-report"
          @click="handleCopyReport"
        >
          Copy report JSON
        </button>
        <p v-if="copyStatus" role="status" class="muted">
          {{ copyStatus }}
        </p>
        <textarea
          data-testid="ingestion-report-json"
          :value="reportJson"
          readonly
          rows="16"
          aria-label="Ingestion run report JSON"
        />
      </template>
      <p v-else>No ingestion run recorded.</p>
    </section>

    <section class="panel-section">
      <h2>Database</h2>
      <button
        @click="wipeVideoDataUseCase?.execute()"
        :disabled="!wipeVideoDataUseCase"
      >
        Wipe Database
      </button>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { WipeVideoDataUseCase } from '@/application/usecases'
import { useAppStateStore, useVideoStore } from '@presentation/stores'
import { storeToRefs } from 'pinia'
import { computed, inject, ref, watch } from 'vue'
import { WIPE_VIDEO_DATA_USE_CASE_KEY } from '@presentation/di/injectionKeys'

const wipeVideoDataUseCase = inject<WipeVideoDataUseCase>(
  WIPE_VIDEO_DATA_USE_CASE_KEY,
)

const appState = useAppStateStore()
const videoStore = useVideoStore()

const { isDiagnosticsPanelOpen } = storeToRefs(appState)
const {
  displayedIngestionSession,
  queuedIngestionCount,
  isThumbnailDrainPaused,
  ingestionConcurrencyOverride,
  autoIngestionConcurrency,
  effectiveIngestionConcurrency,
  thumbnailConcurrencyOverride,
  autoThumbnailConcurrency,
  effectiveThumbnailConcurrency,
} = storeToRefs(videoStore)

const ingestionConcurrencyOptions = [1, 2, 3, 4]
const thumbnailConcurrencyOptions = [1, 2, 3, 4]
const copyStatus = ref('')
const copyStatusReportJson = ref('')
const ingestionConcurrencySelection = computed(() =>
  ingestionConcurrencyOverride.value == null
    ? 'auto'
    : String(ingestionConcurrencyOverride.value),
)
const thumbnailConcurrencySelection = computed(() =>
  thumbnailConcurrencyOverride.value == null
    ? 'auto'
    : String(thumbnailConcurrencyOverride.value),
)
const displayedIngestionProgress = computed(
  () => displayedIngestionSession.value?.progress ?? null,
)
const runReport = computed(() => videoStore.createDisplayedIngestionRunReport())
const reportJson = computed(() =>
  runReport.value ? JSON.stringify(runReport.value, null, 2) : '',
)

watch(reportJson, (currentReportJson) => {
  if (currentReportJson !== copyStatusReportJson.value) {
    copyStatus.value = ''
  }
})

const foregroundEffectiveJobs = computed(
  () =>
    displayedIngestionProgress.value?.effectiveConcurrency ??
    runReport.value?.foreground.concurrency.effective ??
    effectiveIngestionConcurrency.value,
)
const backgroundPreviewCounts = computed(
  () =>
    runReport.value?.backgroundPreviews.counts ?? {
      queued: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      total: 0,
      pending: 0,
    },
)
const phaseLabel = computed(() => {
  const phase = displayedIngestionProgress.value?.phase
  const labels = {
    identifying: 'Identifying',
    classifying: 'Classifying',
    'ingesting-fresh': 'Ingesting fresh videos',
    'ingesting-retries': 'Retrying prior failures',
    complete: 'Complete',
  } as const

  return phase ? labels[phase] : 'Ingestion'
})
const drainStatusLabel = computed(() => {
  if (isThumbnailDrainPaused.value) {
    return queuedIngestionCount.value > 0
      ? 'Thumbnail drain paused'
      : 'Ingestion active'
  }

  return 'Thumbnail drain running'
})

const formatSecondsPerVideo = (averageMs: number | null | undefined) =>
  averageMs == null ? '—' : `${(averageMs / 1000).toFixed(2)} s/video`

const formatVideosPerSecond = (
  completedVideosPerSecond: number | null | undefined,
) =>
  completedVideosPerSecond == null
    ? '—'
    : `${completedVideosPerSecond.toFixed(2)} videos/s`

const handleCloseClicked = () => {
  appState.toggleDiagnosticsPanel(false)
}

const getConcurrencyValue = (event: Event) => {
  if (!(event.target instanceof HTMLSelectElement)) {
    return undefined
  }

  return event.target.value === 'auto' ? null : Number(event.target.value)
}

const handleIngestionConcurrencyChange = (event: Event) => {
  const value = getConcurrencyValue(event)
  if (value === undefined) {
    return
  }

  videoStore.setIngestionConcurrencyOverride(value)
}

const handleThumbnailConcurrencyChange = (event: Event) => {
  const value = getConcurrencyValue(event)
  if (value === undefined) {
    return
  }

  videoStore.setThumbnailConcurrencyOverride(value)
}

const handleCopyReport = async () => {
  const jsonToCopy = reportJson.value
  if (!jsonToCopy) {
    return
  }

  copyStatus.value = ''

  if (
    typeof navigator === 'undefined' ||
    typeof navigator.clipboard?.writeText !== 'function'
  ) {
    copyStatusReportJson.value = jsonToCopy
    copyStatus.value = 'Clipboard unavailable. Select and copy the JSON below.'
    return
  }

  try {
    await navigator.clipboard.writeText(jsonToCopy)
    if (reportJson.value !== jsonToCopy) {
      return
    }

    copyStatusReportJson.value = jsonToCopy
    copyStatus.value = 'Report copied.'
  } catch {
    if (reportJson.value !== jsonToCopy) {
      return
    }

    copyStatusReportJson.value = jsonToCopy
    copyStatus.value = 'Copy failed. Select and copy the JSON below.'
  }
}
</script>

<style scoped>
.panel {
  --panelWidth: 380px;
  --panelNavHeight: 30px;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: auto;
  box-sizing: border-box;
  width: var(--panelWidth);
  max-width: 100%;
  background-color: rgba(7, 59, 104, 0.95);
  color: azure;
  height: auto;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 25;
}

nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgb(3, 3, 95);
  padding: 10px;
  text-align: end;
}

.panel section {
  padding: 1em;
}

.panel-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-section:last-of-type {
  border-bottom: 0;
}

.stats-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}

.stats-list div {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
}

.stats-list dt {
  font-size: 0.8rem;
  color: rgba(240, 255, 255, 0.7);
}

.stats-list dd {
  margin: 0.2rem 0 0;
  font-weight: 600;
}

.panel-label {
  display: block;
  margin-bottom: 0.4rem;
}

select {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(127, 255, 212, 0.35);
  background: rgba(0, 0, 0, 0.2);
  color: azure;
}

textarea {
  box-sizing: border-box;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.65rem;
  resize: vertical;
  border: 1px solid rgba(127, 255, 212, 0.35);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.32);
  color: azure;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
}

.muted {
  color: rgba(240, 255, 255, 0.7);
  font-size: 0.85rem;
}

nav button {
  background-color: rgba(0, 0, 0, 0);
  border-color: aquamarine;
  border-radius: 5px;
}

h1 {
  font-size: 1.5rem;
}

h2 {
  font-size: 1.3rem;
}
</style>
