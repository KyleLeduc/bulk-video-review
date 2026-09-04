<template>
  <main>
    <p v-if="totalCount === 0" class="empty-state" role="status">
      Add videos to begin reviewing
    </p>
    <div
      v-else-if="visibleCount === 0"
      class="empty-state empty-state--filtered"
    >
      <p role="status">No videos match these filters</p>
      <button type="button" @click="videoFilterStore.clearFilters()">
        Clear filters
      </button>
    </div>
    <div v-show="visibleCount > 0" class="container" ref="container">
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
import {
  useAppStateStore,
  useVideoFilterStore,
  useVideoStore,
} from '@presentation/stores'
import { storeToRefs } from 'pinia'
import VideoCard from '@presentation/components/VideoCard.vue'

const videoStore = useVideoStore()
const videoFilterStore = useVideoFilterStore()
const appStateStore = useAppStateStore()
const { filteredVideos, totalCount, visibleCount } =
  storeToRefs(videoFilterStore)
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
  grid-template-columns: repeat(v-bind(columnCount), minmax(0, 1fr));
  gap: 0;
  align-items: start;
}

.empty-state {
  margin: 3rem 1rem;
  color: rgba(231, 237, 245, 0.78);
  text-align: center;
}

.empty-state--filtered {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 1rem;
}

.empty-state--filtered p {
  margin: 0;
}

.empty-state button {
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #f2f6fb;
  font: inherit;
  cursor: pointer;
}

.empty-state button:focus-visible {
  outline: 2px solid #6ec5ff;
  outline-offset: 2px;
}
</style>
