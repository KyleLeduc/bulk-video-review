<script setup lang="ts">
import { onMounted } from 'vue'
import DiagnosticsPanel from '@/components/utils/DiagnosticsPanel.vue'
import NavBar from '@/components/NavBar.vue'
import VideoGallery from '@/components/VideoGallery.vue'
import { VideoMetadataController } from '@/services/StorageController'

const initServices = () => {
  new VideoMetadataController().init()
}

onMounted(() => {
  initServices()
})
</script>

<template>
  <NavBar />

  <VideoGallery />

  <DiagnosticsPanel />
</template>
