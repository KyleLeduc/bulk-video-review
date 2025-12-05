<template>
  <aside class="filter-panel" :class="{ closed: !isFilterPanelOpen }">
    <header class="filter-panel__header">
      <div>
        <p class="filter-panel__eyebrow">Review controls</p>
        <h2>Filters</h2>
      </div>
      <button class="ghost" @click="appStateStore.toggleFilterPanel()">
        {{ isFilterPanelOpen ? 'Hide' : 'Show' }}
      </button>
    </header>

    <section class="filter-panel__content">
      <div class="control">
        <label for="searchQuery">Search title</label>
        <input
          id="searchQuery"
          v-model.trim="searchQuery"
          type="text"
          placeholder="e.g. onboarding walkthrough"
        />
      </div>

      <div class="control control--inline">
        <div>
          <label for="minDuration">Min duration (minutes)</label>
          <input
            id="minDuration"
            v-model="minDurationInput"
            type="text"
            inputmode="decimal"
            placeholder="0"
          />
          <p v-if="minDurationValidation" class="hint error">
            {{ minDurationValidation }}
          </p>
        </div>
        <div>
          <label for="maxDuration">Max duration (minutes)</label>
          <input
            id="maxDuration"
            v-model="maxDurationInput"
            type="text"
            inputmode="decimal"
            placeholder="no limit"
          />
          <p v-if="maxDurationValidation" class="hint error">
            {{ maxDurationValidation }}
          </p>
        </div>
      </div>

      <p v-if="durationRangeWarning" class="hint warning">
        {{ durationRangeWarning }}
      </p>

      <div class="control">
        <SelectDropdown
          label="Columns"
          select-id="columnCount"
          :options="columnOptions"
          :selected="appStateStore.columnCount"
          @select="(value) => (appStateStore.columnCount = Number(value))"
        />
        <p class="hint">Changes apply immediately to the gallery.</p>
      </div>

      <p class="hint subtle">
        Pinned videos stay visible even when filters hide others.
      </p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAppStateStore, useVideoStore } from '@presentation/stores'
import SelectDropdown from '@/presentation/components/inputs/SelectDropdown.vue'

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()

const { minDuration, maxDuration, searchQuery } = storeToRefs(videoStore)
const { isFilterPanelOpen } = storeToRefs(appStateStore)
const columnOptions = [
  { label: '2 columns', value: 2 },
  { label: '3 columns', value: 3 },
  { label: '4 columns', value: 4 },
]

const minDurationInput = ref(minDuration.value ? String(minDuration.value) : '')
const maxDurationInput = ref(maxDuration.value ? String(maxDuration.value) : '')

const minDurationValidation = ref('')
const maxDurationValidation = ref('')

const decimalPattern = /^\d*(\.\d+)?$/

watch(minDurationInput, (value) => {
  if (!value.trim()) {
    minDurationValidation.value = ''
    videoStore.setMinDuration(0)
    return
  }

  if (!decimalPattern.test(value)) {
    minDurationValidation.value = 'Use numbers only'
    return
  }

  minDurationValidation.value = ''
  videoStore.setMinDuration(parseFloat(value))
})

watch(maxDurationInput, (value) => {
  if (!value.trim()) {
    maxDurationValidation.value = ''
    videoStore.setMaxDuration(0)
    return
  }

  if (!decimalPattern.test(value)) {
    maxDurationValidation.value = 'Use numbers only'
    return
  }

  maxDurationValidation.value = ''
  videoStore.setMaxDuration(parseFloat(value))
})

watch(minDuration, (value) => {
  const numericValue = value ? String(value) : ''
  if (numericValue !== minDurationInput.value) {
    minDurationInput.value = numericValue
  }
})

watch(maxDuration, (value) => {
  const numericValue = value ? String(value) : ''
  if (numericValue !== maxDurationInput.value) {
    maxDurationInput.value = numericValue
  }
})

const durationRangeWarning = computed(() => {
  if (
    maxDuration.value > 0 &&
    minDuration.value > 0 &&
    minDuration.value > maxDuration.value
  ) {
    return 'Max duration should be greater than min duration.'
  }

  return ''
})
</script>

<style scoped>
.filter-panel {
  background: radial-gradient(circle at 20% 20%, #1f2a3b, #0e1623 60%);
  color: #e7edf5;
  min-height: 100vh;
  padding: 1.5rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  transition:
    width 0.3s ease,
    padding 0.3s ease,
    opacity 0.3s ease;
  width: min(100%, var(--panel-size, 320px));
  box-sizing: border-box;
}

.filter-panel.closed {
  width: 0;
  padding: 1.5rem 0 1.5rem 0;
  opacity: 0.2;
  overflow: hidden;
}

.filter-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-panel__eyebrow {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: rgba(231, 237, 245, 0.6);
  margin: 0;
}

h2 {
  margin: 0.1rem 0 0;
}

.filter-panel__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.control--inline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

label {
  font-weight: 600;
  color: rgba(231, 237, 245, 0.9);
}

input,
button {
  font: inherit;
}

input {
  padding: 0.6rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background-color: rgba(255, 255, 255, 0.08);
  color: #f2f6fb;
}

input:focus {
  outline: 2px solid #6ec5ff;
  outline-offset: 2px;
}

.ghost {
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.04);
  color: #f2f6fb;
  cursor: pointer;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(231, 237, 245, 0.7);
}

.hint.error {
  color: #ff8f8f;
}

.hint.warning {
  color: #ffc164;
}

.hint.subtle {
  color: rgba(231, 237, 245, 0.6);
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .filter-panel {
    min-height: auto;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .filter-panel.closed {
    width: 100%;
    height: 0;
    padding: 0;
  }
}
</style>
