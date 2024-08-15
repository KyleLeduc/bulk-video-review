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
import { useVideoStore } from '@/stores/videosStore'
import { parseFileList } from '@/services/VideoParsers'

const handleInput = async (e: Event) => {
  if (!(e.target instanceof HTMLInputElement)) return

  if (e.target.files) {
    const parsedVideos = await parseFileList(e.target.files)

    useVideoStore().addVideos(parsedVideos)
  }
}
</script>
