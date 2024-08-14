<template>
  <div>
    <input
      @change="handleInput"
      ref="input"
      type="file"
      id="fileInput"
      webkitdirectory
      multiple
    />
  </div>
  <div ref="videoWall"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useVideoStore } from '@/stores/videosStore'
import { FileVideoParser } from './FileVideoParser'
import { VideoMetadataController } from '@/services'
import type { ParsedVideo } from '@/types'

const videoStore = useVideoStore()

const input = ref<null | HTMLInputElement>(null)
const parser = new FileVideoParser()

const handleInput = async (e: Event) => {
  if (!(e.target instanceof HTMLInputElement)) return

  const input = e.target
  const { files } = input
  const storage = new VideoMetadataController()

  if (files) {
    for (const file of files) {
      try {
        // try to get the video from storage
        let videoDto = await storage.get(await parser.generateHash(file))

        if (!videoDto) {
          // if we didn't find a video, create
          const newVideoDto = await parser.transformVideoData(file)

          if (newVideoDto) {
            videoDto = await storage.post(newVideoDto)
          } else {
            // we didn't find a video and couldn't create a new VideoEntity
            continue
          }
        }

        const parsedVideo: ParsedVideo = {
          ...videoDto,
          url: URL.createObjectURL(file),
          pinned: false,
        }

        videoStore.addVideo([parsedVideo])
      } catch (e) {
        console.error('file input error', e)
      }
    }
  }
}
</script>
