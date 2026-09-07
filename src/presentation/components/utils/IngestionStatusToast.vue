<template>
  <aside v-if="shouldRenderToast && ingestionProgress" class="ingestion-toast">
    <div class="ingestion-toast__header">
      <div>
        <p class="eyebrow">{{ toastEyebrow }}</p>
        <h2>{{ progressHeadline }}</h2>
        <p
          v-if="
            isPreviewProcessingPaused &&
            thumbnailGenerationProgress.pendingCount > 0
          "
          role="status"
          data-test="previews-paused"
        >
          Previews paused — return to this tab and window to resume. Completed
          previews are kept.
        </p>
        <p v-if="ingestionElapsedLabel" class="ingestion-toast__timing">
          {{ ingestionElapsedLabel }}
        </p>
      </div>

      <div class="ingestion-toast__actions">
        <div class="queue-summary">
          <p v-if="queueSummaryLabel" class="queue-summary__line">
            {{ queueSummaryLabel }}
          </p>
          <p v-if="queueStatusLabel" class="queue-summary__line">
            {{ queueStatusLabel }}
          </p>
        </div>
        <button
          class="ingestion-toast__close"
          type="button"
          aria-label="Dismiss ingestion status"
          @click="dismissToast"
        >
          ✕
        </button>
      </div>
    </div>

    <section
      v-if="isShowingThumbnailProgress && previewProductProgress"
      class="product-progress"
      aria-label="Preview products"
    >
      <p class="eyebrow">This import</p>
      <div
        v-for="product in productRows"
        :key="product.kind"
        class="product-progress__row"
      >
        <p>
          {{ product.label }} ready {{ product.ready }} / {{ product.total }}
        </p>
        <progress
          :value="product.ready"
          :max="product.total || 1"
          :aria-label="`${product.label} ready`"
        />
        <small
          >Queued {{ product.queued }} · Working {{ product.processing }} ·
          Unavailable {{ product.failed }}</small
        >
      </div>
      <template v-if="!isThumbnailDrainPaused">
        <p v-if="activePreviewProducts.length" class="eyebrow">
          Active work across all videos
        </p>
        <p
          v-for="job in activePreviewProducts"
          :key="job.videoId"
          class="product-progress__active"
          role="status"
        >
          {{
            job.stage === 'persisting'
              ? 'Saving'
              : job.stage === 'loading'
                ? 'Preparing'
                : 'Generating'
          }}
          {{ job.product === 'motionClips' ? 'clips' : 'seek thumbnails' }} —
          {{ job.title }}
        </p>
      </template>
    </section>

    <div
      v-if="!isShowingThumbnailProgress || !previewProductProgress"
      class="ingestion-toast__meter"
      aria-hidden="true"
    >
      <template v-if="isShowingThumbnailProgress">
        <span
          class="segment segment--generated"
          :style="{
            width: `${segmentWidth(thumbnailGenerationProgress.generatedCount, thumbnailGenerationProgress.total)}%`,
          }"
        />
        <span
          class="segment segment--pending"
          :style="{
            width: `${segmentWidth(thumbnailGenerationProgress.pendingCount, thumbnailGenerationProgress.total)}%`,
          }"
        />
        <span
          class="segment segment--failed"
          :style="{
            width: `${segmentWidth(thumbnailGenerationProgress.failedCount, thumbnailGenerationProgress.total)}%`,
          }"
        />
      </template>
      <template v-else>
        <span
          class="segment segment--existing"
          :style="{
            width: `${segmentWidth(ingestionProgress.existingCount + (ingestionProgress.duplicateCount ?? 0), ingestionProgress.total)}%`,
          }"
        />
        <span
          class="segment segment--new"
          :style="{
            width: `${segmentWidth(ingestionProgress.createdCount, ingestionProgress.total)}%`,
          }"
        />
        <span
          class="segment segment--error"
          :style="{
            width: `${segmentWidth(ingestionProgress.failedCount + (ingestionProgress.skippedCount ?? 0), ingestionProgress.total)}%`,
          }"
        />
      </template>
    </div>

    <div
      v-if="!isShowingThumbnailProgress || !previewProductProgress"
      class="ingestion-toast__legend"
      aria-label="Ingestion status colors"
    >
      <template v-if="isShowingThumbnailProgress">
        <span class="legend-item">
          <span
            class="legend-swatch legend-swatch--generated"
            aria-hidden="true"
          />
          Generated
        </span>
        <span class="legend-item">
          <span
            class="legend-swatch legend-swatch--pending"
            aria-hidden="true"
          />
          Pending
        </span>
        <span class="legend-item">
          <span
            class="legend-swatch legend-swatch--failed"
            aria-hidden="true"
          />
          Failed
        </span>
      </template>
      <template v-else>
        <span class="legend-item">
          <span
            class="legend-swatch legend-swatch--existing"
            aria-hidden="true"
          />
          Existing + duplicates
        </span>
        <span class="legend-item">
          <span class="legend-swatch legend-swatch--new" aria-hidden="true" />
          New
        </span>
        <span class="legend-item">
          <span class="legend-swatch legend-swatch--error" aria-hidden="true" />
          Error + skipped
        </span>
      </template>
    </div>

    <div
      v-if="!isShowingThumbnailProgress || !previewProductProgress"
      class="ingestion-toast__stats"
    >
      <template v-if="isShowingThumbnailProgress">
        <span>
          Generated {{ thumbnailGenerationProgress.generatedCount }} /
          {{ thumbnailGenerationProgress.total }}
        </span>
        <span>Pending {{ thumbnailGenerationProgress.pendingCount }}</span>
        <span>Failed {{ thumbnailGenerationProgress.failedCount }}</span>
      </template>
      <template v-else>
        <span> Active jobs {{ ingestionProgress.activeItemCount ?? 0 }} </span>
        <span>
          Pending jobs {{ ingestionProgress.pendingItemCount ?? 0 }}
        </span>
        <span>
          Job limit {{ ingestionProgress.effectiveConcurrency ?? 1 }}
        </span>
        <span>Existing {{ ingestionProgress.existingCount }}</span>
        <span
          >New {{ ingestionProgress.createdCount }} /
          {{ ingestionProgress.newCount }}</span
        >
        <span>Error {{ ingestionProgress.failedCount }}</span>
        <span>Skipped {{ ingestionProgress.skippedCount ?? 0 }}</span>
        <span>Duplicates {{ ingestionProgress.duplicateCount ?? 0 }}</span>
        <span v-if="ingestionProgress.knownErrorCount > 0">
          Retry queue {{ ingestionProgress.knownErrorCount }}
        </span>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useVideoStore } from '@presentation/stores'

const AUTO_DISMISS_DELAY_MS = 3000
const ELAPSED_TIMER_INTERVAL_MS = 100

const videoStore = useVideoStore()
const {
  ingestionProgress,
  ingestionStartedAtMs,
  ingestionCompletedAtMs,
  isIngesting,
  queuedIngestionCount,
  isThumbnailDrainPaused,
  isPreviewProcessingPaused,
  shouldShowProgressToast,
  thumbnailGenerationProgress,
  previewProductProgress,
  activePreviewProducts,
} = storeToRefs(videoStore)
const productRows = computed(() =>
  previewProductProgress.value
    ? [
        {
          kind: 'motionClips',
          label: 'Clips',
          ...previewProductProgress.value.motionClips,
        },
        {
          kind: 'keyframes',
          label: 'Seek thumbnails',
          ...previewProductProgress.value.keyframes,
        },
      ]
    : [],
)
const dismissed = ref(false)
const isLingering = ref(false)
const nowMs = ref(Date.now())
let dismissTimerId: number | null = null
let elapsedTimerId: number | null = null

const clearDismissTimer = () => {
  if (dismissTimerId !== null) {
    clearTimeout(dismissTimerId)
    dismissTimerId = null
  }
}

const clearElapsedTimer = () => {
  if (elapsedTimerId !== null) {
    clearInterval(elapsedTimerId)
    elapsedTimerId = null
  }
}

const syncElapsedClock = () => {
  nowMs.value = Date.now()
}

const startElapsedTimer = () => {
  syncElapsedClock()
  clearElapsedTimer()
  elapsedTimerId = window.setInterval(
    syncElapsedClock,
    ELAPSED_TIMER_INTERVAL_MS,
  )
}

const startDismissCountdown = () => {
  clearDismissTimer()
  isLingering.value = true
  dismissTimerId = window.setTimeout(() => {
    isLingering.value = false
    dismissTimerId = null
  }, AUTO_DISMISS_DELAY_MS)
}

const dismissToast = () => {
  dismissed.value = true
  isLingering.value = false
  clearDismissTimer()
}

watch(ingestionProgress, (progress, previous) => {
  if (!progress) {
    dismissed.value = false
    isLingering.value = false
    clearDismissTimer()
    return
  }

  if (!previous) {
    dismissed.value = false
    isLingering.value = false
    clearDismissTimer()

    if (
      progress.completedCount >= progress.total &&
      !shouldShowProgressToast.value
    ) {
      startDismissCountdown()
    }
  }
})

watch(isIngesting, (ingesting) => {
  if (ingesting) {
    startElapsedTimer()
    return
  }

  clearElapsedTimer()
  syncElapsedClock()
})

watch(shouldShowProgressToast, (isVisible, wasVisible) => {
  if (isVisible) {
    isLingering.value = false
    clearDismissTimer()
    return
  }

  if (!wasVisible || !ingestionProgress.value || dismissed.value) {
    return
  }

  startDismissCountdown()
})

onBeforeUnmount(() => {
  clearDismissTimer()
  clearElapsedTimer()
})

const shouldRenderToast = computed(
  () =>
    Boolean(ingestionProgress.value) &&
    !dismissed.value &&
    (shouldShowProgressToast.value || isLingering.value),
)

const isShowingThumbnailProgress = computed(
  () => !isIngesting.value && thumbnailGenerationProgress.value.hasWork,
)

const toastEyebrow = computed(() =>
  isShowingThumbnailProgress.value
    ? 'Background previews'
    : 'Foreground ingestion',
)

const foregroundPhaseLabel = computed(() => {
  const labels = {
    identifying: 'Identifying videos',
    classifying: 'Classifying videos',
    'ingesting-fresh': 'Ingesting new videos',
    'ingesting-retries': 'Retrying prior failures',
    complete: 'Complete',
  } as const
  const phase = ingestionProgress.value?.phase

  return phase ? labels[phase] : 'Processing videos'
})

const queueSummaryLabel = computed(() => {
  if (queuedIngestionCount.value <= 0) {
    return null
  }

  const suffix = queuedIngestionCount.value === 1 ? '' : 's'
  return `${queuedIngestionCount.value} import queued${suffix}`
})

const queueStatusLabel = computed(() => {
  if (queuedIngestionCount.value <= 0) {
    return null
  }

  return isThumbnailDrainPaused.value
    ? 'Thumbnail drain paused'
    : 'Thumbnail drain running'
})

const progressHeadline = computed(() => {
  if (!ingestionProgress.value) {
    return ''
  }

  if (isShowingThumbnailProgress.value) {
    if (previewProductProgress.value) {
      if (thumbnailGenerationProgress.value.isActive)
        return 'Preparing previews'
      return thumbnailGenerationProgress.value.failedCount > 0
        ? 'Previews finished with issues'
        : 'Previews complete'
    }
    return `Generated ${thumbnailGenerationProgress.value.generatedCount} / ${thumbnailGenerationProgress.value.total}`
  }

  return `${foregroundPhaseLabel.value} · ${ingestionProgress.value.completedCount} / ${ingestionProgress.value.total}`
})

const formatElapsedSeconds = (elapsedMs: number) =>
  `${(elapsedMs / 1000).toFixed(1)}s`

const ingestionElapsedMs = computed(() => {
  const startedAtMs = ingestionStartedAtMs.value
  if (startedAtMs == null) {
    return null
  }

  const completedAtMs = ingestionCompletedAtMs.value
  const endTimeMs = completedAtMs ?? nowMs.value

  return Math.max(endTimeMs - startedAtMs, 0)
})

const ingestionElapsedLabel = computed(() => {
  const elapsedMs = ingestionElapsedMs.value
  if (elapsedMs == null) {
    return null
  }

  if (isIngesting.value) {
    return `Elapsed ${formatElapsedSeconds(elapsedMs)}`
  }

  return `Foreground completed in ${formatElapsedSeconds(elapsedMs)}`
})

const segmentWidth = (count: number, total: number) => {
  if (!total) {
    return 0
  }

  return (count / total) * 100
}
</script>

<style scoped>
.ingestion-toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  width: min(92vw, 640px);
  background: rgba(10, 18, 29, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 1rem 1.1rem;
  color: #eef4fb;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  z-index: 30;
}

.ingestion-toast__close {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #eef4fb;
  cursor: pointer;
  font: inherit;
}

.ingestion-toast__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.ingestion-toast__header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.eyebrow {
  margin: 0 0 0.15rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(238, 244, 251, 0.65);
}

h2 {
  margin: 0;
  font-size: 1.15rem;
}

.ingestion-toast__timing {
  margin: 0.35rem 0 0;
  color: rgba(238, 244, 251, 0.82);
  font-size: 0.9rem;
}

.queue-summary {
  margin: 0;
  color: rgba(238, 244, 251, 0.75);
  font-size: 0.9rem;
  text-align: right;
}

.product-progress {
  display: grid;
  gap: 0.65rem;
}

.product-progress__row p,
.product-progress__active {
  margin: 0;
  overflow-wrap: anywhere;
}

.product-progress__row progress {
  width: 100%;
  height: 0.6rem;
  accent-color: #67d7ff;
}

.product-progress__row small {
  color: rgba(238, 244, 251, 0.75);
}

.product-progress__active {
  font-size: 0.85rem;
}

.ingestion-toast__meter {
  display: flex;
  height: 0.8rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.ingestion-toast__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  margin-top: 0.65rem;
  color: rgba(238, 244, 251, 0.72);
  font-size: 0.82rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  display: inline-block;
}

.segment {
  display: block;
  height: 100%;
}

.segment--existing {
  background: linear-gradient(90deg, #3db18a, #62d0a9);
}

.legend-swatch--existing {
  background: linear-gradient(90deg, #3db18a, #62d0a9);
}

.segment--new {
  background: linear-gradient(90deg, #3f8cff, #7cb8ff);
}

.legend-swatch--new {
  background: linear-gradient(90deg, #3f8cff, #7cb8ff);
}

.segment--error {
  background: linear-gradient(90deg, #ff7a59, #ffb366);
}

.legend-swatch--error {
  background: linear-gradient(90deg, #ff7a59, #ffb366);
}

.segment--generated {
  background: linear-gradient(90deg, #ffb347, #ffd27d);
}

.legend-swatch--generated {
  background: linear-gradient(90deg, #ffb347, #ffd27d);
}

.segment--pending {
  background: linear-gradient(90deg, #3f8cff, #7cb8ff);
}

.legend-swatch--pending {
  background: linear-gradient(90deg, #3f8cff, #7cb8ff);
}

.segment--failed {
  background: linear-gradient(90deg, #ff7a59, #ffb366);
}

.legend-swatch--failed {
  background: linear-gradient(90deg, #ff7a59, #ffb366);
}

.ingestion-toast__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-top: 0.75rem;
  color: rgba(238, 244, 251, 0.78);
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .ingestion-toast {
    bottom: 1rem;
    padding: 0.9rem;
  }

  .ingestion-toast__header {
    flex-direction: column;
    align-items: start;
  }

  .ingestion-toast__actions {
    width: 100%;
    justify-content: space-between;
  }

  .queue-summary {
    text-align: left;
  }
}
</style>
