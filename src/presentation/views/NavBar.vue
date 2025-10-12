<template>
  <nav>
    <h1>bulk-video-review</h1>
    <FileInput />

    <div class="buttons">
      <div class="button" @click="handleClearUnpinned">💣</div>
    </div>
    <div class="bulk-video-review">
      <label for="durationFilter">Duration: </label>
      <input
        @keyup="handleDurationFilter"
        type="text"
        name="durationFilter"
        id="durationFilter"
        :placeholder="'Duration'"
        :value="minDuration"
      />
      <span class="validationMessage">{{ durationValidationMessage }}</span>
      <span @mouseup="appStateStore.toggleDiagnosticsPanel(true)">🧰</span>
    </div>
    <div class="column-selector">
      <label for="columnCount">Columns: </label>
      <select
        id="columnCount"
        v-model="appStateStore.columnCount"
        @change="handleColumnChange"
      >
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
      </select>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useVideoStore, useAppStateStore } from '@presentation/stores'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'

import FileInput from '@presentation/components/inputs/FileInput.vue'

const videoStore = useVideoStore()
const appStateStore = useAppStateStore()

const { minDuration } = storeToRefs(videoStore)

const durationValidationMessage = ref('')

const handleClearUnpinned = () => {
  videoStore.removeAllUnpinned()
}

function handleDurationFilter(e: Event) {
  const inputElement = e.target as HTMLInputElement
  const regex = /^\d+$/

  regex.test(inputElement.value) || !inputElement.value
    ? (durationValidationMessage.value = '')
    : (durationValidationMessage.value = 'Only numbers')

  const value = parseFloat(inputElement.value) || 0
  videoStore.setMinDuration(value)
}

function handleColumnChange(e: Event) {
  const selectElement = e.target as HTMLSelectElement
  appStateStore.columnCount = parseInt(selectElement.value)
}
</script>

<style scoped>
nav {
  position: sticky;
  top: 0;
  padding: 0.5em 0;
  background-color: brown;
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
}

nav > h1 {
  color: aliceblue;
  padding: 0;
  margin: 0;
}

main {
  display: flex;
  align-items: center;
  flex-direction: column;
}

header input {
  height: 2em;
}

.bulk-video-review {
  padding: 0 1em;
  color: aliceblue;
}

.bulk-video-review > input {
  margin: 0 10px;
}

.bulk-video-review > span {
  padding-left: 1em;
}

.validationMessage {
  color: white;
}

.errorMessage {
  background-color: white;
  left: 30%;
  color: red;
  font-weight: bold;
  padding: 0.5em 1em;
  border-radius: 10px;
  position: absolute;
}

.button {
  padding: 0.25em 0.5em;
  background-color: azure;
  border: 1px solid black;
  border-radius: 5px;
  margin: 0 0 0 0.5em;
  cursor: pointer;
}

.buttons {
  display: flex;
  flex-direction: row;
}

.column-selector {
  color: aliceblue;
}

.column-selector select {
  margin-left: 0.5em;
}
</style>
