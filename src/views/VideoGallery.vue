<template>
  <main>
    <div class="container" v-auto-animate>
      <div class="card" v-for="video in filteredVideos" :key="video.id">
        <VideoCard
          @pin-video="handlePin"
          @remove-video="handleRemove"
          :video="video"
        />
      </div>
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
main {
  margin: 0 3em 3em 3em;
}

.container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  min-height: 100vh;
}

.card {
  display: flex;
  flex-direction: column;
  margin: 0.02em;
  border: 1px solid grey;
  border-radius: 5px;
  max-height: 362px;
}
</style>
