<template>
  <main>
    <div class="container" v-auto-animate>
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
import { useVideoStore } from '@/stores/videosStore'
import { useAppStateStore } from '@/stores/appStateStore'
import { storeToRefs } from 'pinia'
import VideoCard from '@/components/VideoCard.vue'

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()
const { filteredVideos } = storeToRefs(videoStore)
const { columnCount } = storeToRefs(appStateStore)

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
