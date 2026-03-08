<template>
  <div class="card" :class="cardClasses">
    <div
      v-if="showThumbnailActivityRing"
      class="thumbnail-activity-ring"
      :class="thumbnailActivityRingClasses"
      :style="{ '--ring-progress': String(thumbnailActivityProgress) }"
    />

    <div class="cardSurface">
      <div class="cardMedia">
        <img
          class="thumb"
          ref="thumbElement"
          v-if="!state.showVideo"
          :src="video.thumb"
          @mouseenter="startThumbRotation"
          @mouseleave="stopThumbRotation"
          alt=""
          srcset=""
        />
        <VideoEmbed
          v-else
          ref="videoElement"
          :video="props.video"
          :options="embedInitOptions"
        />
      </div>

      <div class="cardNav">
        <div class="pin" @click="handlePinVideo">📌</div>
        <div v-if="isVidLoaded" class="buttonGroup">
          <span @click="handleMute">
            <div v-if="videoElement?.state.isMuted">🔇</div>
            <div v-else>🔈</div>
          </span>

          <span @click="updateLoop">
            <div v-if="!loopState.loopStartTime && !loopState.loopEndTime">
              🔁
            </div>
            <div v-else-if="loopState.loopStartTime && !loopState.loopEndTime">
              ➰
            </div>
            <div v-else>➿</div>
          </span>
        </div>

        <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(-30)">
          ⏪⏪
        </div>
        <div v-if="isVidLoaded" @click="handleSkip(-15)">⏪</div>
        <div class="tabs">
          <div>{{ props.video.votes }} 🗳️</div>
          <div v-if="!isVidLoaded" class="tab" @click="loadVideo">Thumbs</div>
          <div v-else class="tab video" @click="loadVideo">Video</div>
          <div>⏱️ {{ Math.floor(props.video.duration / 60) }}</div>
        </div>
        <div v-if="isVidLoaded" @click="handleSkip(30)">⏩</div>
        <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(60)">
          ⏩⏩
        </div>
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
import type { ParsedVideo } from '@domain/entities'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import VideoEmbed from './VideoEmbed.vue'
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
  rotateThumbs: boolean
  thumbIndex: number
}

const state = reactive<State>({
  showVideo: false,
  rotateThumbs: false,
  thumbIndex: 0,
})

const thumbElement = ref<HTMLImageElement | null>(null)
const intervalId = ref<number | null>(null)
const hoverWarmupTimeoutId = ref<number | null>(null)
const hoverWarmupProgressIntervalId = ref<number | null>(null)
const hoverWarmupProgress = ref(0)
const HOVER_WARMUP_DELAY_MS = 250
const thumbnailJobState = computed(() =>
  videoStore.getThumbnailJobState(props.video.id),
)
const isThumbnailJobActive = computed(
  () =>
    thumbnailJobState.value === 'queued' ||
    thumbnailJobState.value === 'processing',
)
const isHoverArming = computed(
  () =>
    !isThumbnailJobActive.value &&
    hoverWarmupProgress.value > 0 &&
    hoverWarmupProgress.value < 1,
)
const thumbnailActivityProgress = computed(() =>
  isThumbnailJobActive.value ? 1 : hoverWarmupProgress.value,
)
const showThumbnailActivityRing = computed(
  () => thumbnailActivityProgress.value > 0,
)
const thumbnailActivityRingClasses = computed(() => ({
  'thumbnail-activity-ring--hover': isHoverArming.value,
  'thumbnail-activity-ring--active': isThumbnailJobActive.value,
}))
const cardClasses = computed(() => ({
  'card--hover-arming': isHoverArming.value,
  'card--thumbnail-active': isThumbnailJobActive.value,
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
    props.video.thumbUrls.length > 1
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

const updateThumbSrc = () => {
  if (thumbElement.value && props.video.thumbUrls.length > 0) {
    state.thumbIndex = (state.thumbIndex + 1) % props.video.thumbUrls.length
    thumbElement.value.src = props.video.thumbUrls[state.thumbIndex]
  }
}

const startThumbRotation = async () => {
  if (
    hoverWarmupTimeoutId.value === null &&
    props.video.thumbUrls.length <= 1 &&
    !isThumbnailJobActive.value
  ) {
    beginHoverWarmupProgressAnimation()

    hoverWarmupTimeoutId.value = window.setTimeout(() => {
      clearHoverWarmupProgressAnimation(false)
      hoverWarmupProgress.value = 1
      videoStore.requestThumbnailWarmup(props.video.id)
      hoverWarmupTimeoutId.value = null
    }, HOVER_WARMUP_DELAY_MS)
  }

  if (intervalId.value === null) {
    intervalId.value = window.setInterval(updateThumbSrc, 500)
  }
}

const stopThumbRotation = () => {
  if (hoverWarmupTimeoutId.value !== null) {
    clearTimeout(hoverWarmupTimeoutId.value)
    hoverWarmupTimeoutId.value = null
  }

  clearHoverWarmupProgressAnimation(!isThumbnailJobActive.value)
  if (isThumbnailJobActive.value) {
    hoverWarmupProgress.value = 1
  }

  if (intervalId.value !== null) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }

  thumbElement.value && (thumbElement.value.src = props.video.thumb)
}

onBeforeUnmount(() => {
  stopThumbRotation()
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

const isVidLoaded = computed(() => {
  return videoElement.value !== null
})

const handleMute = () =>
  videoElement.value && videoElement.value.controls.toggleMute()

const handleSkip = (duration: number) =>
  videoElement.value && videoElement.value.controls.skip(duration)

function handlePinVideo() {
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

  const thumbs = Array.isArray(props.video.thumbUrls)
    ? props.video.thumbUrls.length
    : 0
  values.push({
    key: 'thumbnail count',
    value: thumbs ? `${thumbs} thumbnail(s)` : 'No additional thumbnails',
  })

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

.thumb,
.cardMedia :deep(video) {
  display: block;
  width: 100%;
  height: 100%;
}

.thumb {
  object-fit: cover;
}

.cardMedia :deep(video) {
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
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid brown;
  position: absolute;
  top: -100%;
  left: 0;
  right: 0;
  opacity: 0;
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
.card:focus-within .cardNav {
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
.card:focus-within .cardNav {
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
