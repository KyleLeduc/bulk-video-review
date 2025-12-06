<template>
  <nav>
    <div class="nav-left">
      <h1>bulk-video-review</h1>
      <button class="ghost" @click="appStateStore.toggleFilterPanel()">
        {{ isFilterPanelOpen ? 'Hide filters' : 'Show filters' }}
      </button>
    </div>

    <div class="nav-actions">
      <FileInput />

      <button class="ghost" @click="handleClearUnpinned">Clear unpinned</button>

      <button class="ghost" @click="appStateStore.toggleDiagnosticsPanel(true)">
        Diagnostics
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useVideoStore, useAppStateStore } from '@presentation/stores'
import { storeToRefs } from 'pinia'

import FileInput from '@presentation/components/inputs/FileInput.vue'

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()
const { isFilterPanelOpen } = storeToRefs(appStateStore)

const handleClearUnpinned = () => {
  videoStore.removeAllUnpinned()
}
</script>

<style scoped>
nav {
  position: sticky;
  top: 0;
  padding: 0.65em 1.5em;
  background-color: #0c121b;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

nav > h1 {
  color: #f2f6fb;
  padding: 0;
  margin: 0;
}

main {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ghost {
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #f2f6fb;
  cursor: pointer;
}
</style>
