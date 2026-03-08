<template>
  <nav
    ref="navElement"
    class="nav-shell"
    :class="{ 'nav-shell--hidden': isHidden }"
    :style="{ '--nav-height': `${navHeight}px` }"
  >
    <div class="nav-left">
      <NavTitle />
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useVideoStore, useAppStateStore } from '@presentation/stores'
import { storeToRefs } from 'pinia'

import FileInput from '@presentation/components/inputs/FileInput.vue'
import NavTitle from '@presentation/components/layout/NavTitle.vue'

const HIDE_SCROLL_THRESHOLD = 72
const SCROLL_DELTA_THRESHOLD = 4

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()
const { isFilterPanelOpen } = storeToRefs(appStateStore)
const isHidden = ref(false)
const navHeight = ref(0)
const navElement = ref<HTMLElement | null>(null)
let lastScrollY = 0

const updateNavVisibility = () => {
  const currentScrollY = Math.max(window.scrollY || 0, 0)
  const delta = currentScrollY - lastScrollY

  if (currentScrollY <= HIDE_SCROLL_THRESHOLD) {
    isHidden.value = false
    lastScrollY = currentScrollY
    return
  }

  if (delta > SCROLL_DELTA_THRESHOLD) {
    isHidden.value = true
  } else if (delta < -SCROLL_DELTA_THRESHOLD) {
    isHidden.value = false
  }

  lastScrollY = currentScrollY
}

const handleClearUnpinned = () => {
  videoStore.removeAllUnpinned()
}

onMounted(() => {
  navHeight.value = navElement.value?.offsetHeight ?? 0
  lastScrollY = Math.max(window.scrollY || 0, 0)
  window.addEventListener('scroll', updateNavVisibility, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateNavVisibility)
})
</script>

<style scoped>
.nav-shell {
  position: sticky;
  top: 0;
  z-index: 20;
  margin-bottom: 0;
  padding: 0.65em 1.5em;
  background-color: #0c121b;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  transition:
    transform 0.22s ease,
    margin-bottom 0.22s ease,
    box-shadow 0.22s ease;
}

.nav-shell--hidden {
  transform: translateY(calc(var(--nav-height, 0px) * -1));
  margin-bottom: calc(var(--nav-height, 0px) * -1);
  box-shadow: none;
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
