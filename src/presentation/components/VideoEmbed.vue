<template>
  <video
    width="100%"
    controls
    :key="video.id"
    ref="videoFrame"
    @volumechange="handleVolumeChange"
    :src="playbackUrl"
  ></video>
</template>

<script setup lang="ts">
import type { ParsedVideo } from '@domain/entities'
import { inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { IVideoSessionRegistry } from '@app/ports'
import { VIDEO_SESSION_REGISTRY_KEY } from '@presentation/di/injectionKeys'

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
const playbackUrl = ref(props.video.url)
const acquiredFromRegistry = ref(false)

const sessionRegistry = inject<IVideoSessionRegistry>(
  VIDEO_SESSION_REGISTRY_KEY,
)

const state = reactive({
  isMuted: false,
})

const loopingState = reactive({
  startTime: undefined as number | undefined,
  endTime: undefined as number | undefined,
})

const handleVolumeChange = (e: Event) => {
  if (e.target instanceof HTMLVideoElement) {
    state.isMuted = e.target?.muted
  }
}

const controls = {
  toggleMute: () => {
    videoFrame.value && (videoFrame.value.muted = !videoFrame.value?.muted)
  },

  togglePlay: () => {
    if (videoFrame.value?.paused) {
      videoFrame.value?.play()
    } else {
      videoFrame.value?.pause()
    }
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

onMounted(() => {
  let updatedSource = false

  if (sessionRegistry && !props.video.url) {
    const acquired = sessionRegistry.acquireObjectUrl(props.video.id)
    if (acquired) {
      playbackUrl.value = acquired
      acquiredFromRegistry.value = true
      updatedSource = true
    }
  }

  if (videoFrame.value) {
    if (updatedSource && playbackUrl.value) {
      videoFrame.value.src = playbackUrl.value
    }

    state.isMuted = props.options.muted
    videoFrame.value.volume = props.options.volume
    videoFrame.value.muted = props.options.muted

    videoFrame.value.ontimeupdate = () => {
      if (
        !videoFrame.value ||
        loopingState.startTime === undefined ||
        loopingState.endTime === undefined
      )
        return

      if (videoFrame.value.currentTime >= loopingState.endTime) {
        videoFrame.value.currentTime = loopingState.startTime
      }
    }

    if (props.options.playing) {
      videoFrame.value.play()
    }
  }
})

onBeforeUnmount(() => {
  if (sessionRegistry && acquiredFromRegistry.value) {
    sessionRegistry.releaseObjectUrl(props.video.id)
  }
})
</script>
