import { defineStore } from 'pinia'

interface State {
  /** Diagnostics panel visibility */
  _diagnosticsPanelVisible: boolean
}

export const useAppStateStore = defineStore('appState', {
  state: (): State => {
    return {
      _diagnosticsPanelVisible: false,
    }
  },
  getters: {
    diagnosticsPanelVisible(state) {
      return state._diagnosticsPanelVisible
    },
  },
  actions: {
    toggleDiagnosticsPanel(newVisibility?: boolean) {
      if (newVisibility === undefined) {
        this._diagnosticsPanelVisible = !this._diagnosticsPanelVisible
        return
      }

      this._diagnosticsPanelVisible = newVisibility
    },
  },
})
