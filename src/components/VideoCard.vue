<template>
  <div class="cardNav">
    <div class="pin" @click="handlePinVideo">📌</div>
    <div v-if="isVidLoaded" @click="videoElement?.controls.toggleMute">
      <div v-if="videoElement?.state.isMuted">🔇</div>
      <div v-else>🔈</div>
    </div>

    <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(-60)">⏪⏪</div>
    <div v-if="isVidLoaded" @click="handleSkip(-30)">⏪</div>
    <div class="tabs">
      <div>{{ props.video.votes }} 🗳️</div>
      <div class="tab" @click="loadVideo">Thumbs</div>
      <div class="tab video" @click="loadVideo">Video</div>
      <div>⏱️ {{ props.video.duration }}</div>
    </div>
    <div v-if="isVidLoaded" @click="handleSkip(30)">⏩</div>
    <div class="big-skip" v-if="isVidLoaded" @click="handleSkip(60)">⏩⏩</div>
    <div class="close" @click="handleRemoveVideo">❌</div>
  </div>
  <div class="content">
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
import { VideoMetadataService } from '@/application'
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
 * single toggle between thumbs/vids
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
  const storage = VideoMetadataService.getInstance() // todo move logic to videoStore
  storage.updateVotes(props.video.id, 2)

  emit('pinVideo', props.video.id)
}

function handleRemoveVideo() {
  VideoMetadataService.getInstance().updateVotes(props.video.id, -1) // todo move logic to videoStore
  emit('removeVideo', props.video.id)
}

function loadVideo() {
  state.showVideo = !state.showVideo
  if (state.showVideo === true) {
    VideoMetadataService.getInstance().updateVotes(props.video.id, 1)
  } else {
    VideoMetadataService.getInstance().updateVotes(props.video.id, -1)
  }
}
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
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
}

.content {
  height: 100%;
}

.cardNav {
  display: flex;
  align-items: center;
  justify-content: space-between;

  * {
    cursor: pointer;
  }
}

.close,
.pin {
  padding: 0 12px;
}

.thumb {
  width: 100%;
}

.big-skip {
  letter-spacing: -10px;
  padding: 2px 5px;
}
</style>
