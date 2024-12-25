import { defineStore } from 'pinia'
import { ref } from 'vue'

import { HotkeysService } from '@app/services'

const hotkeysService = new HotkeysService()

export const useAppStateStore = defineStore('appState', () => {
  hotkeysService.registerHotkey('Ctrl+Alt+2', toggleDiagnosticsPanel)

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
