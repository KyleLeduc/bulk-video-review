<template>
  <section class="panel" v-if="isDiagnosticsPanelOpen">
    <nav>
      <h1>Diagnostics Panel</h1>
      <button @click="handleCloseClicked">❌</button>
    </nav>
    <section class="panel-section">
      <h2>Ingestion</h2>
      <p v-if="activeIngestionProgress">
        {{ activeIngestionProgress.completedCount }} /
        {{ activeIngestionProgress.total }}
        complete
      </p>
      <p v-else>No active ingestion session.</p>
      <dl v-if="activeIngestionProgress" class="stats-list">
        <div>
          <dt>Existing</dt>
          <dd>{{ activeIngestionProgress.existingCount }}</dd>
        </div>
        <div>
          <dt>New</dt>
          <dd>
            {{ activeIngestionProgress.createdCount }} /
            {{ activeIngestionProgress.newCount }}
          </dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{{ activeIngestionProgress.failedCount }}</dd>
        </div>
        <div>
          <dt>Retry queue</dt>
          <dd>{{ activeIngestionProgress.knownErrorCount }}</dd>
        </div>
      </dl>
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
      <h2>Thumbnail queue</h2>
      <dl class="stats-list">
        <div>
          <dt>Queued</dt>
          <dd>{{ thumbnailQueueSummary.queued }}</dd>
        </div>
        <div>
          <dt>Processing</dt>
          <dd>{{ thumbnailQueueSummary.processing }}</dd>
        </div>
        <div>
          <dt>Ready</dt>
          <dd>{{ thumbnailQueueSummary.ready }}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{{ thumbnailQueueSummary.failed }}</dd>
        </div>
      </dl>

      <label class="panel-label" for="thumbnailConcurrency">
        Thumbnail concurrency
      </label>
      <select
        id="thumbnailConcurrency"
        :value="concurrencySelection"
        @change="handleConcurrencyChange"
      >
        <option value="auto">Auto ({{ autoThumbnailConcurrency }})</option>
        <option v-for="value in concurrencyOptions" :key="value" :value="value">
          {{ value }}
        </option>
      </select>
      <p class="muted">
        Effective workers: {{ effectiveThumbnailConcurrency }}
      </p>
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
import { computed, inject } from 'vue'
import { WIPE_VIDEO_DATA_USE_CASE_KEY } from '@presentation/di/injectionKeys'

const wipeVideoDataUseCase = inject<WipeVideoDataUseCase>(
  WIPE_VIDEO_DATA_USE_CASE_KEY,
)

const appState = useAppStateStore()
const videoStore = useVideoStore()

const { isDiagnosticsPanelOpen } = storeToRefs(appState)
const {
  activeIngestionSession,
  queuedIngestionCount,
  isThumbnailDrainPaused,
  thumbnailQueueSummary,
  thumbnailConcurrencyOverride,
  autoThumbnailConcurrency,
  effectiveThumbnailConcurrency,
} = storeToRefs(videoStore)

const concurrencyOptions = [1, 2, 3, 4]
const concurrencySelection = computed(() =>
  thumbnailConcurrencyOverride.value == null
    ? 'auto'
    : String(thumbnailConcurrencyOverride.value),
)
const activeIngestionProgress = computed(
  () => activeIngestionSession.value?.progress ?? null,
)
const drainStatusLabel = computed(() => {
  if (isThumbnailDrainPaused.value) {
    return queuedIngestionCount.value > 0
      ? 'Thumbnail drain paused'
      : 'Ingestion active'
  }

  return 'Thumbnail drain running'
})

const handleCloseClicked = () => {
  appState.toggleDiagnosticsPanel(false)
}

const handleConcurrencyChange = (event: Event) => {
  if (!(event.target instanceof HTMLSelectElement)) {
    return
  }

  if (event.target.value === 'auto') {
    videoStore.setThumbnailConcurrencyOverride(null)
    return
  }

  videoStore.setThumbnailConcurrencyOverride(Number(event.target.value))
}
</script>

<style scoped>
.panel {
  --panelWidth: 300px;
  --panelNavHeight: 30px;
  position: absolute;
  inset: 0 0 0 auto;
  display: grid;
  grid-template-rows: 30px auto;
  width: 300px;
  background-color: rgba(7, 59, 104, 0.95);
  color: azure;
  height: 100vh;
}

nav {
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
  width: 100%;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(127, 255, 212, 0.35);
  background: rgba(0, 0, 0, 0.2);
  color: azure;
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
