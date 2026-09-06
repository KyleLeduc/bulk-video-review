<template>
  <div ref="container" class="motion-preview" aria-hidden="true">
    <video
      v-if="source"
      :key="source"
      ref="player"
      :src="source"
      :style="{ visibility: playing ? 'visible' : 'hidden' }"
      muted
      playsinline
      :controls="false"
      tabindex="-1"
      aria-hidden="true"
      disablepictureinpicture
      disableremoteplayback
      controlslist="nodownload nofullscreen noremoteplayback"
      @ended="advance"
      @error="mediaError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VideoPreviewClip } from '@domain/entities'

const props = defineProps<{ clips: VideoPreviewClip[]; active: boolean }>()
const emit = defineEmits<{ error: [] }>()
const container = ref<HTMLElement>()
const player = ref<HTMLVideoElement>()
const source = ref<string | null>(null)
const playing = ref(false)
const focused = ref(!document.hidden && document.hasFocus())
const inView = ref(typeof IntersectionObserver === 'undefined')
const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(mediaQuery?.matches ?? false)
const allowed = computed(
  () =>
    props.active &&
    focused.value &&
    inView.value &&
    !reducedMotion.value &&
    props.clips.length > 0,
)
let observer: IntersectionObserver | undefined
let index = 0
let attempt = 0

function detach(element?: HTMLVideoElement) {
  if (!element) return
  element.pause()
  element.removeAttribute('src')
  element.load()
}
function stop() {
  attempt++
  playing.value = false
  detach(player.value)
  if (source.value) URL.revokeObjectURL(source.value)
  source.value = null
}
function fail() {
  stop()
  emit('error')
}
async function playClip() {
  stop()
  if (!allowed.value) return
  const currentAttempt = attempt
  try {
    source.value = URL.createObjectURL(props.clips[index].blob)
  } catch {
    fail()
    return
  }
  await nextTick()
  const element = player.value
  if (currentAttempt !== attempt || !allowed.value || !element) return
  element.muted = true
  try {
    await element.play()
    if (currentAttempt !== attempt || !allowed.value) {
      detach(element)
      return
    }
    playing.value = true
  } catch {
    if (currentAttempt === attempt) fail()
  }
}
function advance(event: Event) {
  if (event.target !== player.value || !source.value || !allowed.value) return
  index = (index + 1) % props.clips.length
  void playClip()
}
function mediaError(event: Event) {
  if (event.target === player.value && source.value) fail()
}
watch(
  [allowed, () => props.clips],
  () => {
    index = 0
    void playClip()
  },
  { immediate: true, flush: 'sync' },
)

const syncFocus = () => {
  focused.value = !document.hidden && document.hasFocus()
}
const blur = () => {
  focused.value = false
}
const motionChanged = (event: MediaQueryListEvent) => {
  reducedMotion.value = event.matches
}
onMounted(() => {
  window.addEventListener('blur', blur)
  window.addEventListener('focus', syncFocus)
  document.addEventListener('visibilitychange', syncFocus)
  mediaQuery?.addEventListener('change', motionChanged)
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      inView.value = entries[0]?.isIntersecting ?? false
    })
    if (container.value) observer.observe(container.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('blur', blur)
  window.removeEventListener('focus', syncFocus)
  document.removeEventListener('visibilitychange', syncFocus)
  mediaQuery?.removeEventListener('change', motionChanged)
  stop()
})
</script>

<style scoped>
.motion-preview {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.motion-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
</style>
