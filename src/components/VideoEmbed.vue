<template>
  <video
    width="100%"
    controls
    :key="video.id"
    ref="videoFrame"
    @volumechange="handleVolumeChange"
  >
    <source :src="video.url" type="video/mp4" />
  </video>
</template>

<script setup lang="ts">
import type { ParsedVideo } from '@/types'
import { onMounted, reactive, ref } from 'vue'
defineProps<{ video: ParsedVideo }>()
const videoFrame = ref<HTMLVideoElement | null>(null)

const state = reactive({
  isMuted: false,
})

const toggleMute = () => {
  videoFrame.value && (videoFrame.value.muted = !videoFrame.value?.muted)
}

const handleVolumeChange = (e: Event) => {
  if (e.target instanceof HTMLVideoElement) {
    state.isMuted = e.target?.muted
  }
}

const togglePlay = () => {
  if (videoFrame.value?.paused) {
    videoFrame.value?.play()
  } else {
    videoFrame.value?.pause()
  }
}

const skip = (duration: number) => {
  videoFrame.value && (videoFrame.value.currentTime += duration)
}

const controls = { toggleMute, togglePlay, skip }

defineExpose({ controls, state })

onMounted(() => {
  if (videoFrame.value) {
    state.isMuted = videoFrame.value.muted
  }
  videoFrame.value?.play()
})
</script>
