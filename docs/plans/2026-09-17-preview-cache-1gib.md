# 1 GiB preview cache implementation plan

**Goal:** Retain up to 1 GiB (1,073,741,824 bytes) of generated previews, as requested by the owner.

**Architecture:** Keep the existing IndexedDB cache, product keys, schema, and oldest-used eviction policy. Raise the cache and archive snapshot validation caps together. Raise full archive capacity to 2 GiB to leave room for metadata and legacy stills; preserve manifest, binary-count, per-product, extraction-read, concurrency and memory limits.

**Tech stack:** TypeScript, IndexedDB, Vitest, Cypress, immutable preprod deployment.

## Scope and invariants

- Base: deployed f32d673; isolated fix/preview-cache-1gib branch.
- No cache clearing, migration, recipe change, source-video storage, or metadata edits.
- 1 GiB limits encoded cached bytes, not browser/native RAM or browser quota.
- Reuse matching installed dependencies from the existing feature worktree; root dependencies are older. No installation or new development container.

## Tasks

1. Run targeted cache/archive baseline tests. Add failing checks for default eviction at exactly 1 GiB and just above; validate 257 MiB and exactly 1 GiB snapshots, reject over 1 GiB. Use shared small Blob references to avoid allocating a GiB. Verify archive size checks accept sizes between 1 and 2 GiB for format validation and reject over 2 GiB without reading payloads.
2. Raise VideoPreviewCacheRepository.ts cache constant and libraryArchive.ts snapshot limit to 1024*1024*1024. Raise MAX_ARCHIVE_BYTES to 2*1024*1024*1024 and update error text and LibraryBackupPanel.vue maximum-size copy. Rerun targeted tests.
3. Update current backup documentation and backlog with limits and no-clear behavior. Preserve historical plans. Run lint, type-check, unit suite, build and diff check sequentially.
4. Commit scoped files, push branch, require successful trusted CI for exact SHA. Deploy that immutable build via the existing platform workflow. Verify controller, readiness, HTTPS identity and isolated real-browser refresh persistence. Record Notion progress and next owner gate.

## Acceptance and rollback

- Saved data remains compatible; new writes retain up to 1 GiB, oldest-used eviction begins only above the new limit.
- Full backup validation accepts the matching cache size and maintains bounded total size.
- Existing HTTPS preprod serves exact verified artifact. No master integration.
- Preserve prior f32d673 release for rollback. Old releases retain the 256 MiB cap and can evict extra previews on new writes or reject larger backups; rollback is not lossless for newly expanded preview capacity. Review metadata remains separate.
