<template>
  <div ref="container" class="motion-preview" aria-hidden="true">
    <video
      v-if="source && clips.length"
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
    <img
      v-else-if="source"
      :key="source"
      ref="still"
      :src="source"
      :style="{ visibility: playing ? 'visible' : 'hidden' }"
      alt=""
      draggable="false"
      @load="stillLoaded"
      @error="mediaError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VideoPreviewClip, VideoPreviewFrame } from '@domain/entities'

const props = defineProps<{
  clips: VideoPreviewClip[]
  stills?: VideoPreviewFrame[]
  active: boolean
}>()
const emit = defineEmits<{ error: [] }>()
const container = ref<HTMLElement>()
const player = ref<HTMLVideoElement>()
const still = ref<HTMLImageElement>()
const items = computed(() =>
  props.clips.length ? props.clips : props.stills ?? [],
)
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
    items.value.length > 0,
)
let observer: IntersectionObserver | undefined
let index = 0
let attempt = 0
let stillTimer: ReturnType<typeof setTimeout> | undefined

function detach(element?: HTMLVideoElement) {
  if (!element) return
  element.pause()
  element.removeAttribute('src')
  element.load()
}
function stop() {
  attempt++
  clearTimeout(stillTimer)
  stillTimer = undefined
  playing.value = false
  detach(player.value)
  if (source.value) URL.revokeObjectURL(source.value)
  source.value = null
}
function fail() {
  stop()
  emit('error')
}
async function playPreview() {
  stop()
  if (!allowed.value) return
  const currentAttempt = attempt
  try {
    source.value = URL.createObjectURL(items.value[index].blob)
  } catch {
    fail()
    return
  }
  if (!props.clips.length) return
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
  void playPreview()
}
function stillLoaded(event: Event) {
  if (
    event.target !== still.value ||
    !source.value ||
    !allowed.value ||
    props.clips.length
  )
    return
  playing.value = true
  clearTimeout(stillTimer)
  const currentAttempt = attempt
  stillTimer = setTimeout(() => {
    if (currentAttempt !== attempt || !allowed.value) return
    index = (index + 1) % items.value.length
    void playPreview()
  }, 1000)
}
function mediaError(event: Event) {
  if (
    (event.target === player.value || event.target === still.value) &&
    source.value
  )
    fail()
}
watch(
  [allowed, items],
  () => {
    index = 0
    void playPreview()
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
      // One observed element can cross the viewport twice before delivery.
      inView.value = entries.at(-1)?.isIntersecting ?? false
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
.motion-preview video,
.motion-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
</style>
