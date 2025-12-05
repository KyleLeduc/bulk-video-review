<template>
  <label class="file-button" :for="inputId">Choose files</label>
  <input
    class="file-input"
    @change="handleInput"
    type="file"
    :id="inputId"
    webkitdirectory
    multiple
  />
  <div ref="videoWall"></div>
</template>

<script setup lang="ts">
import { useVideoStore } from '@presentation/stores'

const videoStore = useVideoStore()
const inputId = 'fileInput'

const handleInput = async (e: Event) => {
  if (!(e.target instanceof HTMLInputElement)) return

  if (e.target.files) {
    await videoStore.addVideosFromFiles(e.target.files)
  }
}
</script>

<style scoped>
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.file-button {
  display: inline-block;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #f2f6fb;
  cursor: pointer;
  font: inherit;
}

.file-button:hover {
  border-color: rgba(255, 255, 255, 0.35);
}
</style>
