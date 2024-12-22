export class HotkeysService {
  private hotkeys: Record<string, () => void> = {}
  private instantiated = false

  /**
   * Registers a hotkey
   *
   * @param keyCombo keys to listen for
   * @param callback function to call when keys are pressed
   *
   * @example
   * ```ts
   * const hotkeys = new HotkeysService()
   * hotkeys.registerHotkey('Ctrl+Alt+D', () => console.log('Ctrl+Alt+D pressed'))
   * ```
   */
  registerHotkey(keyCombo: string, callback: () => void) {
    if (!this.instantiated) {
      document.addEventListener('keydown', this.handleKeydown.bind(this))

      this.instantiated = true
    }

    const normalized = this.normalizeKeyCombo(keyCombo.toLowerCase())
    this.hotkeys[normalized] = callback
  }

  private handleKeydown(event: KeyboardEvent) {
    const combo = this.normalizeKeyCombo(
      this.composeKeyCombo(event),
    ).toLowerCase()
    if (this.hotkeys[combo]) {
      this.hotkeys[combo]()
      event.preventDefault()
    }
  }

  private composeKeyCombo(event: KeyboardEvent): string {
    const keys: string[] = []
    if (event.ctrlKey) keys.push('Ctrl')
    if (event.altKey) keys.push('Alt')
    if (event.shiftKey) keys.push('Shift')

    keys.push(event.key)

    return keys.join('+')
  }

  private normalizeKeyCombo(keyCombo: string): string {
    const parts = keyCombo.split('+')
    const mainKey = parts.pop()

    parts.sort((a, b) => a.localeCompare(b))

    return parts.join('+') + (parts.length ? '+' : '') + mainKey
  }
}
