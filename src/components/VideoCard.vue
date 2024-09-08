<template>
  <div class="card">
    <div class="cardNav">
      <div class="pin" @click="handlePinVideo">📌</div>
      <div v-if="isVidLoaded" @click="videoElement?.controls.toggleMute">
        <div v-if="videoElement?.state.isMuted">🔇</div>
        <div v-else>🔈</div>
      </div>

      <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(-60)">
        ⏪⏪
      </div>
      <div v-if="isVidLoaded" @click="handleSkip(-30)">⏪</div>
      <div class="tabs">
        <div>{{ props.video.votes }} 🗳️</div>
        <div v-if="!isVidLoaded" class="tab" @click="loadVideo">Thumbs</div>
        <div v-else class="tab video" @click="loadVideo">Video</div>
        <div>⏱️ {{ props.video.duration }}</div>
      </div>
      <div v-if="isVidLoaded" @click="handleSkip(30)">⏩</div>
      <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(60)">
        ⏩⏩
      </div>
      <div class="close" @click="handleRemoveVideo">❌</div>
    </div>
    <img
      class="thumb"
      v-if="!state.showVideo"
      :src="video.thumb"
      alt=""
      srcset=""
    />
    <VideoEmbed ref="videoElement" v-else :video="props.video" />
  </div>
</template>

<script setup lang="ts">
import type { ParsedVideo } from '@/types'
import { computed, reactive, ref } from 'vue'
import VideoEmbed from './VideoEmbed.vue'
import { useVideoStore } from '@/stores/videosStore'

const videoStore = useVideoStore()
const videoElement = ref<InstanceType<typeof VideoEmbed> | null>(null)

const props = defineProps<{ video: ParsedVideo }>()
const emit = defineEmits<{
  (e: 'removeVideo', id: string): void
  (e: 'pinVideo', id: string): void
}>()

interface State {
  showVideo: boolean
  thumbsLoaded: boolean
  interval: {
    id: number
    index: number
  }
}

// const votes = computed(() => {
//   // todo get votes to videos
//   return props.video.
// })

/**
 * todo
 * toggling starts vid muted
 *
 * todo
 * color border based on votes
 *
 * todo
 * pin switches to video muted & not playing
 */

const state = reactive<State>({
  showVideo: false,
  thumbsLoaded: false,
  interval: { id: 0, index: 0 },
})

const isVidLoaded = computed(() => {
  return videoElement.value !== null
})

// const handleMute = () => {
//   if (videoElement.value) {
//     videoElement.value.controls.toggleMute()
//   }
// }

const handleSkip = (duration: number) => {
  if (videoElement.value) {
    videoElement.value.controls.skip(duration)
  }
}

// const handlePlay = () => {
//   if (videoElement.value) {
//     videoElement.value.controls.togglePlay()
//   }
// }

function handlePinVideo() {
  videoStore.updateVotes(props.video.id, 2)

  emit('pinVideo', props.video.id)
}

function handleRemoveVideo() {
  videoStore.updateVotes(props.video.id, -1)
  emit('removeVideo', props.video.id)
}

function loadVideo() {
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
  overflow: hidden; // This will ensure content doesn't overflow the card
}

.cardNav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid brown;

  * {
    cursor: pointer;
  }
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
