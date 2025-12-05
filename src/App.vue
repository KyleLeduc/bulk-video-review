<script setup lang="ts">
import { storeToRefs } from 'pinia'
import DiagnosticsPanel from '@presentation/components/utils/DiagnosticsPanel.vue'
import FilterPanel from '@presentation/components/layout/FilterPanel.vue'
import NavBar from '@presentation/views/NavBar.vue'
import VideoGallery from '@presentation/views/VideoGallery.vue'
import { useAppStateStore } from '@presentation/stores'

const appStateStore = useAppStateStore()
const { isFilterPanelOpen } = storeToRefs(appStateStore)
</script>

<template>
  <div class="app-shell" :class="{ 'panel-collapsed': !isFilterPanelOpen }">
    <FilterPanel />

    <section class="content">
      <NavBar />

      <VideoGallery />
    </section>

    <DiagnosticsPanel />
  </div>
</template>

<style scoped>
.app-shell {
  --panel-size: 320px;
  display: grid;
  grid-template-columns: var(--panel-size) 1fr;
  min-height: 100vh;
  background: linear-gradient(135deg, #0d141e, #0a0f18 60%);
}

.app-shell.panel-collapsed {
  --panel-size: 0px;
}

.content {
  background: #0f1622;
  min-height: 100vh;
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .content {
    order: 2;
  }
}
</style>
