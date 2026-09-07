export type LibraryBackupSummary = {
  createdAt: string
  build: { revision: string | null; dirty: boolean | null; source: string }
  libraryVersion: number
  cacheVersion: number
  counts: Record<string, number>
  archiveBytes: number
}
export interface ILibraryBackup {
  /** True after an interrupted restore; normal storage operations must remain blocked. */
  recoveryRequired(): boolean
  createArchive(): Promise<Blob>
  inspectArchive(archive: Blob): Promise<LibraryBackupSummary>
  restoreArchive(archive: Blob): Promise<void>
}
