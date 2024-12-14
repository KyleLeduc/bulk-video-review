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
import type { ParsedVideo } from '@/domain'
import { onMounted, reactive, ref } from 'vue'

interface VideoEmbedInitOptions {
  playing: boolean
  muted: boolean
  volume: number
}

const props = withDefaults(
  defineProps<{
    video: ParsedVideo
    options?: VideoEmbedInitOptions
  }>(),
  {
    options: (): VideoEmbedInitOptions => ({
      playing: true,
      muted: true,
      volume: 0.5,
    }),
  },
)

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
    state.isMuted = props.options.muted
    videoFrame.value.volume = props.options.volume
    videoFrame.value.muted = props.options.muted
    if (props.options.playing) {
      videoFrame.value.play()
    }
  }
})
</script>
