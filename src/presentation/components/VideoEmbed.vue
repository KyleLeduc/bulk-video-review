<template>
  <div class="video-player-shell">
    <video
      width="100%"
      playsinline
      role="button"
      tabindex="0"
      :aria-label="state.isPlaying ? 'Pause video' : 'Play video'"
      :title="state.isPlaying ? 'Pause video' : 'Play video'"
      :key="video.id"
      ref="videoFrame"
      @click="controls.togglePlay"
      @keydown.enter.prevent="controls.togglePlay"
      @keydown.space.prevent="controls.togglePlay"
      @play="handlePlaybackStarted"
      @pause="handlePlaybackStopped"
      @ended="handlePlaybackStopped"
      @volumechange="handleVolumeChange"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="syncMediaDuration"
      @durationchange="syncMediaDuration"
      :src="playbackUrl"
    ></video>

    <div v-if="canSeek" class="video-preview-rail-container">
      <div
        v-if="canShowPreview && isPreviewVisible && activePreviewFrame"
        class="video-preview-tooltip"
        data-testid="video-preview-tooltip"
        :style="previewTooltipStyle"
      >
        <img
          data-testid="video-preview-image"
          :src="activePreviewFrame.url"
          :width="activePreviewFrame.width"
          :height="activePreviewFrame.height"
          alt=""
        />
        <span data-testid="video-preview-time">{{
          formatTime(previewSeconds ?? 0)
        }}</span>
      </div>

      <input
        class="video-preview-rail"
        data-testid="video-preview-rail"
        type="range"
        min="0"
        :max="effectiveDuration"
        step="0.1"
        :value="currentTimeSeconds"
        aria-label="Video preview and seek timeline"
        :aria-valuetext="timelineValueText"
        @pointermove="handlePreviewPointerMove"
        @pointerleave="hidePreview"
        @focus="showPreviewAt(currentTimeSeconds)"
        @blur="hidePreview"
        @input="handleSeekInput"
      />

      <span class="video-playback-time" data-testid="video-playback-time">
        {{ formatTime(currentTimeSeconds) }} /
        {{ formatTime(effectiveDuration) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParsedVideo } from '@domain/entities'
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import type { IVideoSessionRegistry } from '@app/ports'
import { VIDEO_SESSION_REGISTRY_KEY } from '@presentation/di/injectionKeys'

interface VideoEmbedInitOptions {
  playing: boolean
  muted: boolean
  volume: number
}

interface DisplayVideoPreviewFrame {
  timestampSeconds: number
  url: string
  width: number
  height: number
}

const props = withDefaults(
  defineProps<{
    video: ParsedVideo
    options?: VideoEmbedInitOptions
    previewFrames?: DisplayVideoPreviewFrame[]
  }>(),
  {
    options: (): VideoEmbedInitOptions => ({
      playing: true,
      muted: true,
      volume: 0.5,
    }),
    previewFrames: () => [],
  },
)

const videoFrame = ref<HTMLVideoElement | null>(null)
const playbackUrl = ref(props.video.url)
const acquiredFromRegistry = ref(false)

const sessionRegistry = inject<IVideoSessionRegistry>(
  VIDEO_SESSION_REGISTRY_KEY,
)

const state = reactive({
  isMuted: false,
  isPlaying: false,
})

const loopingState = reactive({
  startTime: undefined as number | undefined,
  endTime: undefined as number | undefined,
})

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const validDuration = (duration: number) =>
  Number.isFinite(duration) && duration > 0 ? duration : 0

const mediaDurationSeconds = ref(validDuration(props.video.duration))
const currentTimeSeconds = ref(0)
const previewSeconds = ref<number | null>(null)
const isPreviewVisible = ref(false)

const effectiveDuration = computed(() =>
  validDuration(mediaDurationSeconds.value || props.video.duration),
)

const canSeek = computed(() => effectiveDuration.value > 0)
const canShowPreview = computed(
  () => canSeek.value && props.previewFrames.length > 0,
)

const activePreviewFrame = computed<DisplayVideoPreviewFrame | null>(() => {
  if (previewSeconds.value === null || props.previewFrames.length === 0) {
    return null
  }

  return props.previewFrames.reduce((nearest, candidate) =>
    Math.abs(candidate.timestampSeconds - previewSeconds.value!) <
    Math.abs(nearest.timestampSeconds - previewSeconds.value!)
      ? candidate
      : nearest,
  )
})

const previewPositionPercent = computed(() =>
  effectiveDuration.value > 0 && previewSeconds.value !== null
    ? clamp((previewSeconds.value / effectiveDuration.value) * 100, 0, 100)
    : 0,
)

const previewTooltipStyle = computed(() => {
  const position = previewPositionPercent.value

  if (position <= 22.5) {
    return { left: '0%', transform: 'translateX(0)' }
  }

  if (position >= 77.5) {
    return { left: '100%', transform: 'translateX(-100%)' }
  }

  return {
    left: `${position}%`,
    transform: 'translateX(-50%)',
  }
})

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

const timelineValueText = computed(
  () =>
    `${formatTime(currentTimeSeconds.value)} of ${formatTime(
      effectiveDuration.value,
    )}`,
)

const showPreviewAt = (seconds: number) => {
  if (!canShowPreview.value) {
    return
  }

  previewSeconds.value = clamp(seconds, 0, effectiveDuration.value)
  isPreviewVisible.value = true
}

const hidePreview = () => {
  isPreviewVisible.value = false
  previewSeconds.value = null
}

const handlePreviewPointerMove = (event: PointerEvent) => {
  const rail = event.currentTarget
  if (!(rail instanceof HTMLInputElement)) {
    return
  }

  const bounds = rail.getBoundingClientRect()
  if (bounds.width <= 0) {
    return
  }

  const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
  showPreviewAt(ratio * effectiveDuration.value)
}

const handleSeekInput = (event: Event) => {
  const rail = event.target
  if (!(rail instanceof HTMLInputElement)) {
    return
  }

  const nextTime = clamp(Number(rail.value), 0, effectiveDuration.value)
  if (!Number.isFinite(nextTime)) {
    return
  }

  currentTimeSeconds.value = nextTime
  showPreviewAt(nextTime)
  if (videoFrame.value) {
    videoFrame.value.currentTime = nextTime
  }
}

const syncMediaDuration = () => {
  if (videoFrame.value) {
    mediaDurationSeconds.value = validDuration(videoFrame.value.duration)
  }
}

const handleTimeUpdate = () => {
  if (!videoFrame.value) {
    return
  }

  if (
    loopingState.startTime !== undefined &&
    loopingState.endTime !== undefined &&
    videoFrame.value.currentTime >= loopingState.endTime
  ) {
    videoFrame.value.currentTime = loopingState.startTime
  }

  currentTimeSeconds.value = videoFrame.value.currentTime
}

const handlePlaybackStarted = () => {
  state.isPlaying = true
}

const handlePlaybackStopped = () => {
  state.isPlaying = false
}

const handleVolumeChange = (e: Event) => {
  if (e.target instanceof HTMLVideoElement) {
    state.isMuted = e.target?.muted
  }
}

const startPlayback = async () => {
  const video = videoFrame.value
  if (!video) return

  try {
    await video.play()
  } catch (error) {
    // A pause or source disposal can interrupt an outstanding play request.
    if (error instanceof DOMException && error.name === 'AbortError') return
    console.warn('[VideoEmbed] Failed to start playback', error)
  }
}

const controls = {
  toggleMute: () => {
    if (!videoFrame.value) {
      return
    }

    videoFrame.value.muted = !videoFrame.value.muted
    state.isMuted = videoFrame.value.muted
  },

  togglePlay: () => {
    if (!videoFrame.value) {
      return
    }

    if (!videoFrame.value.paused) {
      videoFrame.value.pause()
      return
    }

    void startPlayback()
  },

  skip: (duration: number) => {
    videoFrame.value && (videoFrame.value.currentTime += duration)
  },

  setLoopPoint: () => {
    if (!videoFrame.value) return
    const currentTime = videoFrame.value.currentTime

    if (loopingState.startTime === undefined) {
      loopingState.startTime = currentTime
    } else if (loopingState.endTime === undefined) {
      loopingState.endTime = currentTime
    } else {
      loopingState.startTime = undefined
      loopingState.endTime = undefined
    }
  },
}

defineExpose({ controls, state, loopingState })

onMounted(async () => {
  if (sessionRegistry && !props.video.url) {
    const acquired = sessionRegistry.acquireObjectUrl(props.video.id)
    if (acquired) {
      playbackUrl.value = acquired
      acquiredFromRegistry.value = true
    }
  }

  // Let Vue bind src once before play(); a later source assignment aborts it.
  await nextTick()

  if (videoFrame.value) {
    state.isMuted = props.options.muted
    videoFrame.value.volume = props.options.volume
    videoFrame.value.muted = props.options.muted

    if (props.options.playing) {
      void startPlayback()
    }
  }
})

onBeforeUnmount(() => {
  if (videoFrame.value) {
    try {
      videoFrame.value.pause()
      videoFrame.value.ontimeupdate = null
      videoFrame.value.removeAttribute('src')
      videoFrame.value.load()
    } catch (error) {
      console.warn('[VideoEmbed] Failed to dispose playback element', error)
    }
  }

  if (sessionRegistry && acquiredFromRegistry.value) {
    sessionRegistry.releaseObjectUrl(props.video.id)
  }
})
</script>

<style lang="scss" scoped>
.video-player-shell {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
}

.video-preview-rail-container {
  position: relative;
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  background: rgba(5, 7, 10, 0.92);
  z-index: 2;
}

.video-preview-rail {
  flex: 1 1 auto;
  width: auto;
  min-width: 40px;
  margin: 0;
  accent-color: #67d7ff;
  cursor: pointer;
}

.video-playback-time {
  flex: 0 0 auto;
  color: #fff;
  font:
    600 11px/1.2 system-ui,
    sans-serif;
  white-space: nowrap;
}

.video-preview-rail:focus-visible {
  outline: 2px solid #67d7ff;
  outline-offset: 2px;
}

.video-preview-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  width: min(180px, 45%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 4px;
  overflow: hidden;
  background: #05070a;
  color: #fff;
  pointer-events: none;
  z-index: 3;
}

.video-preview-tooltip img {
  display: block;
  width: 100%;
  height: auto;
}

.video-preview-tooltip span {
  display: block;
  padding: 2px 6px;
  font:
    600 12px/1.4 system-ui,
    sans-serif;
  text-align: center;
}

video {
  display: block;
  width: 100%;
  height: auto;
  flex: 1 1 auto;
  min-height: 0;
  object-fit: contain;
  cursor: pointer;
}

video:focus-visible {
  outline: 2px solid #67d7ff;
  outline-offset: -2px;
}
</style>
