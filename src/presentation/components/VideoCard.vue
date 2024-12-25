<template>
  <div class="card">
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

    <div class="cardNav">
      <div class="pin" @click="handlePinVideo">📌</div>
      <div v-if="isVidLoaded" @click="handleMute">
        <div v-if="videoElement?.state.isMuted">🔇</div>
        <div v-else>🔈</div>
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
      <div class="close" @click="handleRemoveVideo">❌</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParsedVideo } from '@domain/entities'
import { computed, reactive, ref } from 'vue'
import VideoEmbed from './VideoEmbed.vue'
import { useVideoStore } from '@app/stores'

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

const updateThumbSrc = () => {
  if (thumbElement.value && props.video.thumbUrls.length > 0) {
    state.thumbIndex = (state.thumbIndex + 1) % props.video.thumbUrls.length
    thumbElement.value.src = props.video.thumbUrls[state.thumbIndex]
  }
}

const startThumbRotation = async () => {
  if (intervalId.value === null) {
    videoStore.updateVideoThumbnails(props.video.id)

    intervalId.value = window.setInterval(updateThumbSrc, 500)
  }
}

const stopThumbRotation = () => {
  if (intervalId.value !== null) {
    clearInterval(intervalId.value)
    intervalId.value = null
  }

  thumbElement.value && (thumbElement.value.src = props.video.thumb)
}

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
</script>

<style lang="scss" scoped>
.card {
  display: flex;
  flex-direction: column;
  border: 1px solid #f0f0f0;
  overflow: hidden;
  position: relative;
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
}

.card:hover .cardNav,
.card:focus-within .cardNav {
  top: 0;
  opacity: 1;
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
