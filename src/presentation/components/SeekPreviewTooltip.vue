<template>
  <div
    class="video-preview-tooltip"
    data-testid="video-preview-tooltip"
    :style="positionStyle"
  >
    <div v-if="frame" class="preview-image-viewport">
      <img
        data-testid="video-preview-image"
        :src="frame.url"
        :width="frame.width"
        :height="frame.height"
        alt=""
      />
    </div>
    <span data-testid="video-preview-time">{{ timeLabel }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  frames: {
    timestampSeconds: number
    url: string
    width: number
    height: number
  }[]
  seconds: number
  duration: number
}>()
const frame = computed(() =>
  props.frames.length
    ? props.frames.reduce((nearest, candidate) =>
        Math.abs(candidate.timestampSeconds - props.seconds) <
        Math.abs(nearest.timestampSeconds - props.seconds)
          ? candidate
          : nearest,
      )
    : null,
)
const positionStyle = computed(() => {
  const percent =
    props.duration > 0
      ? Math.min(100, Math.max(0, (props.seconds / props.duration) * 100))
      : 0
  if (percent <= 22.5) return { left: '0%', transform: 'translateX(0)' }
  if (percent >= 77.5) return { left: '100%', transform: 'translateX(-100%)' }
  return { left: `${percent}%`, transform: 'translateX(-50%)' }
})
const timeLabel = computed(() => {
  const seconds = Math.max(0, Math.floor(props.seconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
</script>
<style scoped>
.video-preview-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  width: min(180px, 45%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 4px;
  overflow: hidden;
  background: #05070a;
  color: #fff;
  pointer-events: none;
  z-index: 3;
}
.preview-image-viewport {
  aspect-ratio: 16 / 9;
}
.preview-image-viewport img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.video-preview-tooltip span {
  display: block;
  padding: 2px 6px;
  font:
    600 12px/1.4 system-ui,
    sans-serif;
  text-align: center;
}
</style>
