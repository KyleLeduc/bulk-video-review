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
import { storeToRefs } from 'pinia'
import VideoCard from '@/components/VideoCard.vue'

const videoStore = useVideoStore()

const { filteredVideos } = storeToRefs(videoStore)

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
  grid-template-columns: repeat(4, 1fr);
}
</style>
