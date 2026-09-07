/** Cross-reload safety latch. Other app tabs must be closed before maintenance. */
export class LibraryMaintenance {
  private busy = false
  private reloadRequired = false
  constructor(
    private readonly storage: Storage | (() => Storage),
    private readonly key: string,
  ) {}
  private get store() {
    return typeof this.storage === 'function' ? this.storage() : this.storage
  }
  recoveryRequired(): boolean {
    return this.store.getItem(this.key) !== null
  }
  assertAvailable() {
    if (this.busy || this.reloadRequired)
      throw new Error('Library maintenance in progress; reload after restore')
    if (this.recoveryRequired())
      throw new Error(
        'Interrupted library restore: open Diagnostics and restore your archive before continuing',
      )
  }
  begin(recovery = false) {
    if (this.busy || this.reloadRequired)
      throw new Error(
        'Library maintenance already active; reload if restore finished',
      )
    if (!recovery) this.assertAvailable()
    this.busy = true
  }
  markRestore() {
    this.store.setItem(
      this.key,
      JSON.stringify({ startedAt: new Date().toISOString(), version: 1 }),
    )
    if (!this.recoveryRequired())
      throw new Error('Unable to persist restore safety marker')
  }
  clearRestore() {
    this.store.removeItem(this.key)
  }
  requireReload() {
    this.reloadRequired = true
  }
  end() {
    this.busy = false
  }
}

export const libraryMaintenance = new LibraryMaintenance(
  () => localStorage,
  'bvr-library-restore-in-progress-v1',
)
