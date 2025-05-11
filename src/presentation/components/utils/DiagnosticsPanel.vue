<template>
  <section class="panel" v-if="isDiagnosticsPanelOpen">
    <nav>
      <h1>Diagnostics Panel</h1>
      <button @click="handleCloseClicked">❌</button>
    </nav>
    <section>
      <h2>Database</h2>
      <button @click="videoMetadataFacade.wipeData()">Wipe Database</button>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useAppStateStore } from '@presentation/stores'
import { storeToRefs } from 'pinia'
import { VideoMetadataFacade } from '@infra/services'

const appState = useAppStateStore()
const videoMetadataFacade = VideoMetadataFacade.getInstance()

const { isDiagnosticsPanelOpen } = storeToRefs(appState)

const handleCloseClicked = () => {
  appState.toggleDiagnosticsPanel(false)
}
</script>

<style scoped>
.panel {
  --panelWidth: 300px;
  --panelNavHeight: 30px;
  position: absolute;
  inset: 0 0 0 auto;
  display: grid;
  grid-template-rows: 30px auto;
  width: 300px;
  background-color: rgba(7, 59, 104, 0.95);
  color: azure;
  height: 100vh;
}

nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgb(3, 3, 95);
  padding: 10px;
  text-align: end;
}

.panel section {
  padding: 1em;
}

nav button {
  background-color: rgba(0, 0, 0, 0);
  border-color: aquamarine;
  border-radius: 5px;
}

h1 {
  font-size: 1.5rem;
}

h2 {
  font-size: 1.3rem;
}
</style>
