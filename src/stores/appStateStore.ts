import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStateStore = defineStore('appState', () => {
  const isDiagnosticsPanelOpen = ref(false)
  const columnCount = ref(4) // Default to 4 columns

  function toggleDiagnosticsPanel(forceOpen?: boolean) {
    if (forceOpen !== undefined) {
      isDiagnosticsPanelOpen.value = forceOpen
    } else {
      isDiagnosticsPanelOpen.value = !isDiagnosticsPanelOpen.value
    }
  }

  return {
    isDiagnosticsPanelOpen,
    columnCount,
    toggleDiagnosticsPanel,
  }
})
