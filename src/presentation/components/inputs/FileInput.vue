<template>
  <div>
    <input
      @change="handleInput"
      type="file"
      id="fileInput"
      webkitdirectory
      multiple
    />
  </div>
  <div ref="videoWall"></div>
</template>

<script setup lang="ts">
import { useVideoStore } from '@app/stores'

const videoStore = useVideoStore()

const handleInput = async (e: Event) => {
  if (!(e.target instanceof HTMLInputElement)) return

  if (e.target.files) {
    await videoStore.addVideosFromFiles(e.target.files)
  }
}
</script>
