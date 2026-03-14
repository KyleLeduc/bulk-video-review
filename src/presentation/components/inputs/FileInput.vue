<template>
  <div
    ref="pickerRoot"
    class="picker-shell"
    data-testid="upload-picker"
    @mouseenter="scheduleMenuOpen"
    @mouseleave="scheduleMenuClose"
    @focusin="openMenu"
    @focusout="handleFocusOut"
  >
    <button
      class="file-button file-button--trigger"
      data-testid="upload-picker-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="openFolderPicker"
    >
      <svg
        class="file-button__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3.75 7.5h5l2 2h9.5v7.75a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2z" />
        <path
          d="M3.75 7.5v-.75a2 2 0 0 1 2-2h4.1a2 2 0 0 1 1.42.59l1.4 1.41H18.25a2 2 0 0 1 2 2v.75"
        />
      </svg>
      <span class="file-button__label">
        {{ triggerLabel }}
      </span>
      <svg
        class="file-button__chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6.75 9.25 5.25 5.5 5.25-5.5" />
      </svg>
    </button>

    <div
      v-if="isOpen"
      class="picker-menu"
      data-testid="upload-picker-menu"
      role="menu"
      aria-label="Add videos options"
    >
      <button
        class="menu-action"
        type="button"
        role="menuitem"
        @click="openFolderPicker"
      >
        <svg
          class="file-button__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M3.75 7.5h5l2 2h9.5v7.75a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2z"
          />
          <path
            d="M3.75 7.5v-.75a2 2 0 0 1 2-2h4.1a2 2 0 0 1 1.42.59l1.4 1.41H18.25a2 2 0 0 1 2 2v.75"
          />
        </svg>
        <span>Choose folder</span>
      </button>

      <button
        class="menu-action"
        type="button"
        role="menuitem"
        @click="openFilePicker"
      >
        <svg
          class="file-button__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M8.75 3.75h6.5l4 4v12.5a2 2 0 0 1-2 2H8.75a2 2 0 0 1-2-2v-14.5a2 2 0 0 1 2-2z"
          />
          <path d="M15.25 3.75v4h4" />
          <path d="M9.75 14.25h6.5" />
          <path d="M9.75 17.75h6.5" />
        </svg>
        <span>Choose files</span>
      </button>
    </div>

    <input
      ref="folderInput"
      class="file-input"
      data-picker-mode="folder"
      type="file"
      webkitdirectory
      :accept="accept"
      @change="handleInput"
    />

    <input
      ref="fileInput"
      class="file-input"
      data-picker-mode="files"
      type="file"
      multiple
      :accept="accept"
      @change="handleInput"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref } from 'vue'
import { getBrowserPlayableVideoAccept } from '@/shared/video/browserPlayableVideoTypes'
import { useVideoStore } from '@presentation/stores'

const HOVER_MENU_DELAY_MS = 1000
const HOVER_MENU_CLOSE_DELAY_MS = 250

const videoStore = useVideoStore()
const { isIngesting, queuedIngestionCount, isThumbnailDrainPaused } =
  storeToRefs(videoStore)
const accept = getBrowserPlayableVideoAccept()
const pickerRoot = ref<HTMLElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
let openMenuTimer: ReturnType<typeof setTimeout> | null = null
let closeMenuTimer: ReturnType<typeof setTimeout> | null = null

const triggerLabel = computed(() => {
  if (queuedIngestionCount.value > 0) {
    const suffix = queuedIngestionCount.value === 1 ? '' : 's'
    return `${queuedIngestionCount.value} import queued${suffix}`
  }

  if (isIngesting.value || isThumbnailDrainPaused.value) {
    return 'Queue videos'
  }

  return 'Add videos'
})

const clearOpenMenuTimer = () => {
  if (openMenuTimer == null) {
    return
  }

  clearTimeout(openMenuTimer)
  openMenuTimer = null
}

const clearCloseMenuTimer = () => {
  if (closeMenuTimer == null) {
    return
  }

  clearTimeout(closeMenuTimer)
  closeMenuTimer = null
}

const closeMenu = () => {
  clearOpenMenuTimer()
  clearCloseMenuTimer()
  isOpen.value = false
}

const openMenu = () => {
  clearOpenMenuTimer()
  clearCloseMenuTimer()
  isOpen.value = true
}

const scheduleMenuOpen = () => {
  clearOpenMenuTimer()
  clearCloseMenuTimer()
  openMenuTimer = setTimeout(() => {
    isOpen.value = true
    openMenuTimer = null
  }, HOVER_MENU_DELAY_MS)
}

const scheduleMenuClose = () => {
  clearOpenMenuTimer()
  clearCloseMenuTimer()
  closeMenuTimer = setTimeout(() => {
    isOpen.value = false
    closeMenuTimer = null
  }, HOVER_MENU_CLOSE_DELAY_MS)
}

const openFolderPicker = () => {
  closeMenu()
  folderInput.value?.click()
}

const openFilePicker = () => {
  closeMenu()
  fileInput.value?.click()
}

const handleFocusOut = (event: FocusEvent) => {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && pickerRoot.value?.contains(nextTarget)) {
    return
  }

  closeMenu()
}

const handleInput = async (e: Event) => {
  if (!(e.target instanceof HTMLInputElement)) return

  if (e.target.files) {
    try {
      await videoStore.addVideosFromFiles(e.target.files)
    } finally {
      e.target.value = ''
    }
  }
}

onBeforeUnmount(() => {
  clearOpenMenuTimer()
  clearCloseMenuTimer()
})
</script>

<style scoped>
.picker-shell {
  position: relative;
  display: inline-block;
}

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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: 2.5rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #f2f6fb;
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.file-button:hover,
.file-button:focus-visible {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.file-button--trigger {
  min-width: 9.5rem;
  justify-content: space-between;
}

.file-button__label {
  font-size: 0.95rem;
  line-height: 1;
}

.file-button__icon {
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
}

.file-button__chevron {
  width: 0.95rem;
  height: 0.95rem;
  flex: none;
  transform: translateY(1px);
}

.picker-menu {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  z-index: 30;
  min-width: 100%;
  padding: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 1rem;
  background: rgba(12, 18, 27, 0.96);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 0.25rem;
  transform-origin: top left;
  animation: reveal-picker-menu 0.18s ease both;
}

.menu-action {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  background: transparent;
  color: #f2f6fb;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.menu-action:hover,
.menu-action:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  outline: none;
}

@keyframes reveal-picker-menu {
  from {
    opacity: 0;
    transform: translateY(-8px) scaleY(0.96);
  }

  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
}
</style>
