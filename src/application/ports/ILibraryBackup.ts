export type LibraryBackupSummary = {
  createdAt: string
  build: { revision: string | null; dirty: boolean | null; source: string }
  libraryVersion: number
  cacheVersion: number
  counts: Record<string, number>
  archiveBytes: number
  /** Counts of archived records, not sums of votes or the current live library. */
  votes: {
    positive: number
    negative: number
    zero: number
    nonzero: number
    missingMetadata: number
    orphanMetadata: number
  }
}
export interface ILibraryBackup {
  /** True after an interrupted restore; normal storage operations must remain blocked. */
  recoveryRequired(): boolean
  createArchive(): Promise<Blob>
  inspectArchive(archive: Blob): Promise<LibraryBackupSummary>
  restoreArchive(archive: Blob): Promise<void>
}
