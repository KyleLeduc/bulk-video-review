<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { inject, onMounted, onBeforeUnmount } from 'vue'
import { LIBRARY_BACKUP_KEY } from '@presentation/di/injectionKeys'
import DiagnosticsPanel from '@presentation/components/utils/DiagnosticsPanel.vue'
import IngestionStatusToast from '@presentation/components/utils/IngestionStatusToast.vue'
import FilterPanel from '@presentation/components/layout/FilterPanel.vue'
import NavBar from '@presentation/views/NavBar.vue'
import VideoGallery from '@presentation/views/VideoGallery.vue'
import { useAppStateStore, useVideoStore } from '@presentation/stores'

const appStateStore = useAppStateStore()
const { isFilterPanelOpen } = storeToRefs(appStateStore)
const videoStore = useVideoStore()
const backup = inject(LIBRARY_BACKUP_KEY, undefined)
if (backup) {
  try {
    videoStore.setLibraryRecoveryRequired(backup.recoveryRequired())
  } catch {
    videoStore.setLibraryRecoveryRequired(true)
  }
  if (videoStore.libraryRecoveryRequired)
    appStateStore.toggleDiagnosticsPanel(true)
}
const syncPreviewActivity = () => {
  videoStore.setPreviewProcessingPaused(document.hidden || !document.hasFocus())
}
const pausePreviews = () => videoStore.setPreviewProcessingPaused(true)

// Normal-app policy only: isolated benchmark hosts retain their own lifecycle.
onMounted(() => {
  syncPreviewActivity()
  document.addEventListener('visibilitychange', syncPreviewActivity)
  window.addEventListener('blur', pausePreviews)
  window.addEventListener('focus', syncPreviewActivity)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', syncPreviewActivity)
  window.removeEventListener('blur', pausePreviews)
  window.removeEventListener('focus', syncPreviewActivity)
})
</script>

<template>
  <div class="app-shell" :class="{ 'panel-collapsed': !isFilterPanelOpen }">
    <FilterPanel :inert="videoStore.isDiagnosticsBusy" />

    <section class="content" :inert="videoStore.isDiagnosticsBusy">
      <NavBar />

      <VideoGallery />
    </section>

    <DiagnosticsPanel />
    <button
      v-if="
        videoStore.libraryRecoveryRequired || videoStore.libraryReloadRequired
      "
      class="recovery-banner"
      @click="appStateStore.toggleDiagnosticsPanel(true)"
    >
      Library locked for recovery — open Diagnostics
    </button>
    <IngestionStatusToast />
  </div>
</template>

<style scoped>
.recovery-banner {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  z-index: 24;
}
.app-shell {
  --panel-size: 320px;
  display: grid;
  grid-template-columns: var(--panel-size) 1fr;
  align-items: start;
  min-height: 100vh;
  background: linear-gradient(135deg, #0d141e, #0a0f18 60%);
}

.app-shell.panel-collapsed {
  --panel-size: 0px;
}

.content {
  background: #0f1622;
  min-height: 100vh;
  min-width: 0;
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
