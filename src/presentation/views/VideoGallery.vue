<template>
  <main>
    <div class="container" ref="container">
      <VideoCard
        v-for="video in filteredVideos"
        :key="video.id"
        @pin-video="handlePin"
        @remove-video="handleRemove"
        :video="video"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { watch, onMounted } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { useDebounce } from '@app/composables'
import { useVideoStore, useAppStateStore } from '@app/stores'
import { storeToRefs } from 'pinia'
import VideoCard from '@presentation/components/VideoCard.vue'

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()
const { filteredVideos } = storeToRefs(videoStore)
const { columnCount } = storeToRefs(appStateStore)

const [container, enableAnimations] = useAutoAnimate({
  easing: 'ease-in',
  duration: 100,
})

const debouncedEnableAnimations = useDebounce(() => {
  enableAnimations(true)
}, 3000)

onMounted(() => {
  enableAnimations(false)
})

watch(filteredVideos, () => {
  debouncedEnableAnimations()
})

function handlePin(id: string) {
  videoStore.togglePinVideo(id)
}

function handleRemove(id: string) {
  videoStore.removeVideo(id)
}
</script>

<style scoped>
.container {
  display: grid;
  grid-template-columns: repeat(v-bind(columnCount), 1fr);
}
</style>
