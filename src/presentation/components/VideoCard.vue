<template>
  <div class="card" :class="cardClasses">
    <div
      v-if="showThumbnailActivityRing"
      class="thumbnail-activity-ring"
      :class="thumbnailActivityRingClasses"
      :style="{ '--ring-progress': String(thumbnailActivityProgress) }"
    />

    <div class="cardSurface">
      <div class="cardMedia" data-testid="video-card-media-frame">
        <img
          class="thumb"
          v-if="!state.showVideo"
          :src="props.video.thumb"
          @mouseenter="startThumbRotation"
          @mouseleave="stopThumbRotation"
          alt=""
          srcset=""
        />
        <MotionPreview
          v-if="!state.showVideo"
          :clips="props.video.motionClips"
          :active="isThumbnailHovered"
          @error="previewDisplayError = true"
        />
        <VideoEmbed
          v-else
          ref="videoElement"
          :video="props.video"
          :options="embedInitOptions"
          :preview-frames="displayPreviewFrames"
        />
      </div>

      <p
        v-if="previewStatusLabel"
        class="preview-status"
        data-testid="video-preview-status"
      >
        {{ previewStatusLabel }}
      </p>
      <div class="cardNav">
        <div class="pin" @click="handlePinVideo">📌</div>
        <button
          class="tab"
          :class="{ video: state.showVideo }"
          data-testid="video-view-toggle"
          type="button"
          :aria-label="state.showVideo ? 'Show thumbnails' : 'Play video'"
          @click="loadVideo"
        >
          {{ state.showVideo ? 'Thumbs' : 'Video' }}
        </button>

        <div v-if="state.showVideo" class="buttonGroup">
          <button
            class="card-control"
            data-testid="video-card-mute"
            type="button"
            :aria-label="
              videoElement?.state?.isMuted ? 'Unmute video' : 'Mute video'
            "
            @click="handleMute"
          >
            <span aria-hidden="true">{{
              videoElement?.state?.isMuted ? '🔇' : '🔈'
            }}</span>
          </button>

          <button
            class="card-control"
            data-testid="video-card-loop"
            type="button"
            :aria-label="loopControlLabel"
            @click="updateLoop"
          >
            <span
              v-if="
                loopState.loopStartTime === undefined &&
                loopState.loopEndTime === undefined
              "
              aria-hidden="true"
            >
              🔁
            </span>
            <span
              v-else-if="loopState.loopEndTime === undefined"
              aria-hidden="true"
            >
              ➰
            </span>
            <span v-else aria-hidden="true">➿</span>
          </button>
        </div>

        <button
          v-if="state.showVideo"
          class="card-control big-skip"
          data-testid="video-card-skip-back-30"
          type="button"
          aria-label="Skip back 30 seconds"
          @click="handleSkip(-30)"
        >
          ⏪⏪
        </button>
        <button
          v-if="state.showVideo"
          class="card-control"
          data-testid="video-card-skip-back-15"
          type="button"
          aria-label="Skip back 15 seconds"
          @click="handleSkip(-15)"
        >
          ⏪
        </button>
        <div class="tabs">
          <div>{{ props.video.votes }} 🗳️</div>
          <div>⏱️ {{ Math.floor(props.video.duration / 60) }}</div>
        </div>
        <button
          v-if="state.showVideo"
          class="card-control"
          data-testid="video-card-skip-forward-30"
          type="button"
          aria-label="Skip forward 30 seconds"
          @click="handleSkip(30)"
        >
          ⏩
        </button>
        <button
          v-if="state.showVideo"
          class="card-control big-skip"
          data-testid="video-card-skip-forward-60"
          type="button"
          aria-label="Skip forward 60 seconds"
          @click="handleSkip(60)"
        >
          ⏩⏩
        </button>
        <div class="infoTrigger">
          <span
            class="info-icon"
            tabindex="0"
            role="button"
            aria-label="Show video file details"
          >
            ℹ️
          </span>
          <div class="info-tooltip" role="tooltip">
            <dl class="info-list">
              <div
                v-for="item in videoMetaEntries"
                :key="item.key"
                class="info-row"
              >
                <dt>{{ item.key }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div class="close" @click="handleRemoveVideo">❌</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hasCompleteVideoPreviews } from '@app/services/previewCompleteness'
import type { ParsedVideo } from '@domain/entities'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import VideoEmbed from './VideoEmbed.vue'
import MotionPreview from './MotionPreview.vue'
import { useVideoStore } from '@presentation/stores'

const videoStore = useVideoStore()
const videoElement = ref<InstanceType<typeof VideoEmbed> | null>(null)

const props = defineProps<{ video: ParsedVideo }>()
const emit = defineEmits<{
  (e: 'removeVideo', id: string): void
  (e: 'pinVideo', id: string): void
}>()

interface State {
  showVideo: boolean
}

const state = reactive<State>({
  showVideo: false,
})

watch(
  () => [props.video.id, state.showVideo] as const,
  ([id, open], previous) => {
    if (previous && previous[0] !== id)
      videoStore.setVideoPreviewOpen(previous[0], false)
    videoStore.setVideoPreviewOpen(id, open)
  },
)

type DisplayPreviewFrame = {
  timestampSeconds: number
  url: string
  width: number
  height: number
}

const displayPreviewFrames = ref<DisplayPreviewFrame[]>([])
const previewObjectUrls = new Map<Blob, string>()
const previewDisplayError = ref(false)
const isThumbnailHovered = ref(false)
const syncDisplayPreviewFrames = () => {
  const frames = [...props.video.keyframes].sort(
    (left, right) => left.timestampSeconds - right.timestampSeconds,
  )
  const currentBlobs = new Set(frames.map((frame) => frame.blob))

  previewObjectUrls.forEach((url, blob) => {
    if (!currentBlobs.has(blob)) {
      URL.revokeObjectURL(url)
      previewObjectUrls.delete(blob)
    }
  })

  try {
    displayPreviewFrames.value = frames.map((frame) => {
      let url = previewObjectUrls.get(frame.blob)
      if (!url) {
        url = URL.createObjectURL(frame.blob)
        previewObjectUrls.set(frame.blob, url)
      }
      return {
        timestampSeconds: frame.timestampSeconds,
        url,
        width: frame.width,
        height: frame.height,
      }
    })
    previewDisplayError.value = false
  } catch {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url))
    previewObjectUrls.clear()
    displayPreviewFrames.value = []
    previewDisplayError.value = true
  }
}
watch(() => props.video.keyframes, syncDisplayPreviewFrames, {
  immediate: true,
})
watch(
  () => props.video.id,
  () => {
    stopThumbRotation()
  },
)

const hoverWarmupTimeoutId = ref<number | null>(null)
const hoverWarmupProgressIntervalId = ref<number | null>(null)
const hoverWarmupProgress = ref(0)
const HOVER_WARMUP_DELAY_MS = 750
const thumbnailJobState = computed(() =>
  videoStore.getThumbnailJobState(props.video.id),
)
const isThumbnailJobActive = computed(
  () =>
    thumbnailJobState.value === 'queued' ||
    thumbnailJobState.value === 'processing',
)
const isClipJobActive = computed(() => {
  const state = videoStore.getPreviewProductState(props.video.id, 'motionClips')
  return state === null
    ? isThumbnailJobActive.value
    : state === 'queued' || state === 'processing'
})
const previewStatusLabel = computed(() => {
  if (!thumbnailJobState.value || hasCompleteVideoPreviews(props.video))
    return ''
  const clips = videoStore.getPreviewProductState(props.video.id, 'motionClips')
  const seeks = videoStore.getPreviewProductState(props.video.id, 'keyframes')
  if (!clips || !seeks) return ''
  const label = (state: string) => {
    if (state === 'queued' || state === 'processing') {
      if (videoStore.isPreviewProcessingPaused) return 'paused'
      return state === 'processing' ? 'generating' : 'queued'
    }
    return state === 'failed'
      ? 'unavailable'
      : state === 'missing'
        ? 'not generated'
        : 'ready'
  }
  return `Clips ${label(clips)} · Seek thumbnails ${label(seeks)}`
})
const isHoverArming = computed(
  () =>
    !isThumbnailJobActive.value &&
    hoverWarmupProgress.value > 0 &&
    hoverWarmupProgress.value < 1,
)
const thumbnailActivityProgress = computed(() =>
  isClipJobActive.value
    ? 1
    : isThumbnailJobActive.value
      ? 0
      : hoverWarmupProgress.value,
)
const showThumbnailActivityRing = computed(
  () => thumbnailActivityProgress.value > 0,
)
const thumbnailActivityRingClasses = computed(() => ({
  'thumbnail-activity-ring--hover': isHoverArming.value,
  'thumbnail-activity-ring--active': isClipJobActive.value,
}))
const cardClasses = computed(() => ({
  'card--hover-arming': isHoverArming.value,
  'card--thumbnail-active': isThumbnailJobActive.value,
  'card--video-open': state.showVideo,
}))

const clearHoverWarmupProgressAnimation = (resetProgress = true) => {
  if (hoverWarmupProgressIntervalId.value !== null) {
    clearInterval(hoverWarmupProgressIntervalId.value)
    hoverWarmupProgressIntervalId.value = null
  }

  if (resetProgress) {
    hoverWarmupProgress.value = 0
  }
}

const beginHoverWarmupProgressAnimation = () => {
  if (
    hoverWarmupProgressIntervalId.value !== null ||
    isThumbnailJobActive.value ||
    hasCompleteVideoPreviews(props.video)
  ) {
    return
  }

  const startedAt = Date.now()
  hoverWarmupProgress.value = 0.04

  hoverWarmupProgressIntervalId.value = window.setInterval(() => {
    const elapsed = Date.now() - startedAt
    hoverWarmupProgress.value = Math.min(elapsed / HOVER_WARMUP_DELAY_MS, 1)

    if (hoverWarmupProgress.value >= 1) {
      clearHoverWarmupProgressAnimation(false)
    }
  }, 16)
}

const startThumbRotation = () => {
  isThumbnailHovered.value = true

  if (
    hoverWarmupTimeoutId.value === null &&
    !hasCompleteVideoPreviews(props.video) &&
    !isThumbnailJobActive.value &&
    thumbnailJobState.value !== 'failed'
  ) {
    beginHoverWarmupProgressAnimation()

    hoverWarmupTimeoutId.value = window.setTimeout(() => {
      clearHoverWarmupProgressAnimation(false)
      hoverWarmupProgress.value = 1
      videoStore.requestThumbnailWarmup(props.video.id)
      hoverWarmupTimeoutId.value = null
    }, HOVER_WARMUP_DELAY_MS)
  }
}

const stopThumbRotation = () => {
  isThumbnailHovered.value = false

  if (hoverWarmupTimeoutId.value !== null) {
    clearTimeout(hoverWarmupTimeoutId.value)
    hoverWarmupTimeoutId.value = null
  }

  clearHoverWarmupProgressAnimation(!isThumbnailJobActive.value)
  if (isThumbnailJobActive.value) {
    hoverWarmupProgress.value = 1
  }
}

onBeforeUnmount(() => {
  videoStore.setVideoPreviewOpen(props.video.id, false)
  stopThumbRotation()
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  previewObjectUrls.clear()
  displayPreviewFrames.value = []
})

watch(isThumbnailJobActive, (isActive) => {
  if (isActive) {
    clearHoverWarmupProgressAnimation(false)
    hoverWarmupProgress.value = 1
    return
  }

  if (hoverWarmupTimeoutId.value === null) {
    hoverWarmupProgress.value = 0
  }
})

const embedInitOptions = {
  playing: false,
  muted: true,
  volume: 0.5,
}

const handleMute = () =>
  videoElement.value && videoElement.value.controls.toggleMute()

const handleSkip = (duration: number) =>
  videoElement.value && videoElement.value.controls.skip(duration)

function handlePinVideo() {
  stopThumbRotation()
  videoStore.updateVotes(props.video.id, 2)

  embedInitOptions.playing = false
  embedInitOptions.muted = true

  state.showVideo = true

  emit('pinVideo', props.video.id)
}

function handleRemoveVideo() {
  videoStore.updateVotes(props.video.id, -1)
  emit('removeVideo', props.video.id)
}

function loadVideo() {
  stopThumbRotation()
  embedInitOptions.playing = true

  state.showVideo = !state.showVideo
  if (state.showVideo === true) {
    videoStore.updateVotes(props.video.id, 1)
  } else {
    videoStore.updateVotes(props.video.id, -1)
  }
}

function updateLoop() {
  if (videoElement.value) {
    videoElement.value.controls.setLoopPoint()
  }
}

const loopState = computed(() => {
  const loopingState = videoElement.value?.loopingState
  return {
    loopStartTime: loopingState?.startTime,

    loopEndTime: loopingState?.endTime,
    isLooping:
      loopingState?.startTime !== undefined &&
      loopingState?.endTime !== undefined,
  }
})

const loopControlLabel = computed(() => {
  if (loopState.value.loopStartTime === undefined) {
    return 'Set loop start'
  }

  if (loopState.value.loopEndTime === undefined) {
    return 'Set loop end'
  }

  return 'Clear loop points'
})

const videoMetaEntries = computed(() => {
  const values: Array<{ key: string; value: string }> = []

  values.push({
    key: 'title',
    value: props.video.title || 'Untitled video',
  })

  values.push({
    key: 'duration',
    value: formatDurationWithSeconds(props.video.duration),
  })

  values.push({
    key: 'motion clips',
    value: String(props.video.motionClips.length),
  })
  values.push({
    key: 'seek thumbnails',
    value: String(props.video.keyframes.length),
  })
  const diagnostic = videoStore.getThumbnailJobDiagnostic(props.video.id)
  for (const [kind, reason] of Object.entries(diagnostic?.failures ?? {})) {
    values.push({ key: kind, value: reason })
  }
  if (diagnostic?.cacheFailures?.length)
    values.push({
      key: 'cache',
      value: 'Not saved: ' + diagnostic.cacheFailures.join(', '),
    })
  if (previewDisplayError.value)
    values.push({ key: 'preview', value: 'Preview display unavailable' })

  values.push({
    key: 'tags',
    value:
      props.video.tags?.length && props.video.tags.filter(Boolean).length
        ? props.video.tags.join(', ')
        : '—',
  })

  values.push({
    key: 'votes',
    value:
      typeof props.video.votes === 'number' ? String(props.video.votes) : '0',
  })

  return values
})

function formatDurationWithSeconds(duration: number): string {
  if (!Number.isFinite(duration) || duration < 0) {
    return '—'
  }

  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60)

  return `${minutes}m ${seconds}s`
}
</script>

<style lang="scss" scoped>
.card {
  position: relative;
  width: 100%;
  min-width: 0;
}

.cardSurface {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid #f0f0f0;
  overflow: hidden;
  position: relative;
  background: #000;
  width: 100%;
  min-width: 0;
}

.cardMedia {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #05070a;
}

.preview-status {
  margin: 0;
  padding: 0.25rem 0.4rem;
  color: #dbe7ef;
  background: #17212b;
  font-size: 0.7rem;
  line-height: 1.4;
}

.cardMedia :deep(.video-player-shell) {
  width: 100%;
  height: 100%;
}

.thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cardMedia :deep(video) {
  width: 100%;
  object-fit: contain;
  background: #000;
}

.thumbnail-activity-ring {
  --ring-progress: 0;
  --ring-fill-color: #67d7ff;
  --ring-track-color: rgba(103, 215, 255, 0.16);
  --ring-glow-color: rgba(103, 215, 255, 0.3);
  position: absolute;
  inset: -4px;
  border-radius: 4px;
  pointer-events: none;
  padding: 4px;
  z-index: 3;
  background: conic-gradient(
    from -90deg,
    var(--ring-fill-color) 0deg calc(var(--ring-progress) * 360deg),
    var(--ring-track-color) calc(var(--ring-progress) * 360deg) 360deg
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  filter: drop-shadow(0 0 10px var(--ring-glow-color));
  transition:
    background 120ms linear,
    filter 120ms linear;
}

.thumbnail-activity-ring--hover {
  --ring-fill-color: #67d7ff;
  --ring-track-color: rgba(103, 215, 255, 0.12);
  --ring-glow-color: rgba(103, 215, 255, 0.28);
}

.thumbnail-activity-ring--active {
  --ring-fill-color: #ffb347;
  --ring-track-color: rgba(255, 179, 71, 0.16);
  --ring-glow-color: rgba(255, 179, 71, 0.38);
}

.cardNav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid brown;
  position: absolute;
  top: -100%;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
  z-index: 4;
  background-color: rgba(255, 255, 255, 0.9);
  transition:
    top 0.3s ease,
    opacity 0.3s ease;

  * {
    cursor: pointer;
  }

  .buttonGroup {
    display: flex;
    align-items: center;
  }
}

.card-control {
  appearance: none;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
}

.infoTrigger {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  font-size: 1.2em;
}

.info-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  max-width: 320px;
  max-height: min(60vh, 320px);
  background: rgba(20, 20, 20, 0.95);
  color: #f7f7f7;
  padding: 12px 14px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition:
    opacity 0.5s ease,
    transform 0.2s ease,
    visibility 0.5s ease;
  pointer-events: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  line-height: 1.35;
}

.infoTrigger:hover .info-tooltip,
.infoTrigger:focus-within .info-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.info-list {
  margin: 0;
  padding: 0;
}

.info-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px;
  font-size: 0.75rem;
  align-items: start;
  word-break: break-word;
}

.info-row + .info-row {
  margin-top: 4px;
}

.info-row dt {
  font-weight: 600;
  text-transform: capitalize;
  color: #f0c674;
}

.info-row dd {
  margin: 0;
}

.card:hover .cardNav,
.card:focus-within .cardNav,
.card--video-open .cardNav {
  top: 0;
  opacity: 1;
  pointer-events: auto;
  transition:
    top 0.3s ease,
    opacity 0.3s ease;
}

.card .cardNav {
  transition-delay: 0.3s; // Add delay for hiding
}

.card:hover .cardNav,
.card:focus-within .cardNav,
.card--video-open .cardNav {
  transition-delay: 0s; // Remove delay for showing
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.close,
.pin {
  padding: 0 12px;
}

.big-skip {
  letter-spacing: -10px;
  padding: 2px 5px;
}

.tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab {
  appearance: none;
  font-family: inherit;
  background-color: black;
  border: 1px solid brown;
  border-width: 2px 3px;
  font-size: 1.2em;
  font-weight: 900;
  color: aliceblue;
  border-radius: 5px 5px 0 0;
  margin-right: 5px;
  padding: 0 0.2em;
  border-bottom-width: 0;
  cursor: pointer;
}
</style>
