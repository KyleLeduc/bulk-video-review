# Ingestion Diagnostics and Library Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ingestion failures auditable by file, expose real clip/seek progress, and let the owner back up and restore browser-local library data before testing.

**Architecture:** Retain the current queue and clip-before-seek policy. Carry bounded progress and failure evidence through the existing worker/adapter/use-case boundaries. Keep backup and read-only file inspection in infrastructure behind application ports, wired through the existing DI composition root.

**Tech Stack:** Vue, Pinia, TypeScript, IndexedDB, browser File/Blob APIs, Mediabunny 1.55.7, Vitest and existing browser smoke tooling. No FFmpeg WASM, source-file rewriting or new scheduler.

**Status:** Approved for implementation. On 2026-09-07 the owner selected the full database, including generated previews. The existing feature checkout is `feat/video-benchmark-view` at `2239629`. Preserve the unrelated pre-existing `docs/backlog.md` edit.

---

## Evidence and scope

The owner reports 98 failed and 31 ready existing-entry upgrades, with 196 failed product attempts and no aborts/cache failures. The supplied report has neither per-file causes nor a tested build identity. Some downloads reportedly work in VLC but not a browser and have previously been repaired externally with FFmpeg; this does not establish the cause of any particular failed file.

Current code observations:

- `videosStore.ts` owns queue attempts, concurrency and report snapshots. Auto remains two workers. Clips/fallbacks/saving finish before seeks; opened-video priority affects only pending seeks.
- Worker clients accept final replies only. Motion and keyframe workers do not send incremental progress. `UpdateVideoPreviewsUseCase` can already forward product/fallback progress to the store.
- Production preview workers accept MP4/AVC, and the timeline guard rejects certain edit lists, leading gaps and track/stored-duration disagreement. These are adapter qualification failures, not necessarily damaged downloads.
- Existing-entry upgrades reuse stored duration. DOM still fallback uses current player duration and subsequently validates against stored duration. Preserve this as a hypothesis until a failing original or representative fixture proves the path.
- The main database is `VideoMetaDataDB` v4. Generated motion, seek and fallback products are in separate `BVRPreviewCache-v1`, capped at 256 MiB. Transactions cannot span both databases.
- Original `File` objects and object URLs are session-only. A database backup cannot include or restore permission to the original videos. Re-selecting a source folder is still required after a reload/restore.

## Design decisions

### 1. Per-file diagnostics and queue progress

Each queued video gets separate clip and seek status/counts, such as `Clips 4/10` and `Seek thumbnails 37/100`. Distinguish queued, generating, paused, fallback, saving, ready and unavailable. Completion counts measure actual finished encoded items; they do not claim frame-streaming or time-remaining accuracy.

Maintain separate product records rather than overwriting the clip evidence when seek work begins. Preserve attempt outcomes and ignore messages from aborted/replaced workers. Closing the panel remains presentation-only.

Exports must include build identity, source identifier, per-product stage/reason/timing/read counters where measured, and failure counts by reason. Use `handled` for aggregates that include failures and separate successful products from settled attempts. Missing measurements remain null/unmeasured. Persist no original media as diagnostics.

### 2. Read-only failed-file audit

Offer an `Inspect failed files` action while the original sources are selected. Inspect only failed items, with one bounded inspector at a time and cancellation; inspection must not compete silently with ingestion or change its success/failure result.

Capture file name, available selected-folder-relative path, size, declared type, detected container family, codec/configuration if parsable, and stored/player/track timeline values when available. Paths are data, never generated executable shell fragments. Clearly flag duplicate basenames or unavailable relative paths.

For MP4-family inputs, inspect declared top-level box boundaries and metadata/media presence, skipping media payloads. Handle extended box sizes, end-of-file-sized boxes, fragmentation, and bounds safely. Never decide that an MP4 is malformed just because its metadata is at the end. A bounded inspection that stops early reports `inconclusive`, not `missing metadata` or `healthy`.

Suggested limits to verify with fixtures: 256 KiB bytes read, 1024 box headers and a 10-second deadline per structural scan. Report the exact coverage and budget exhaustion. Container probing does not establish full decode integrity. A sampled browser check, if offered, must be labeled sampled rather than a whole-file playback certification.

Findings distinguish confirmed malformed structure/truncation, extension/container mismatch, unsupported adapter/browser configuration, timeline discrepancy, I/O failure and inconclusive inspection. Preserve sanitized underlying error names and stages instead of collapsing everything into `generation-failed`.

Provide copyable human-readable findings plus a JSON audit manifest with file identifiers/relative paths suitable for a later PowerShell or shell batch. The default shareable performance report stays redacted; a clearly labeled file-audit export deliberately contains names. No automatic upload or repair. Local `ffprobe` is an optional next diagnostic step, not a browser dependency or a claimed universal repair.

### 3. Backup and restore

Backup includes all persisted library records, votes, tags, covers and ingestion failure records. Make preview inclusion explicit rather than calling a partial export a full snapshot.

**Approved scope:** include generated clips, seek thumbnails and static preview products, along with every durable library store. Original video files remain excluded.

Two approaches were considered:

- Full snapshot: closest to the pre-test experience, but larger and requires explicit two-database restore/recovery handling.
- Library-only snapshot: smaller and simpler atomic library restore; generated previews are not recovered and must be regenerated.

In either case, use a versioned, validated downloadable archive and show record counts, creation/build/schema information and preview inclusion before restore. Original video files, absolute filesystem access, object URLs, in-flight queues and other browser-origin data are excluded. Audit session-only settings separately rather than promising to restore them as database records.

Restore is an explicitly confirmed replacement, not a silent merge: test-created records should not survive a successful rollback. Validate the entire archive before changing live stores; reject unknown/newer schemas, malformed records, duplicate keys, invalid binary references and bounded-size violations. Offer a safety export of the current library first. Do not call the existing destructive wipe routine before validation.

The authoritative library stores must restore in one transaction and resolve only on transaction completion. Block restore while imports, queued/active preview jobs or inspection are outstanding, including focus-paused jobs; explain how to finish/cancel safely. Prevent concurrent UI writes and require other app tabs closed. A multi-database full restore needs a reviewed recovery strategy and explicit partial-cache failure reporting; do not claim cross-database atomicity. No restore against owner live data is part of agent verification.

**Reviewed recovery contract:** use a checksummed binary archive (JSON metadata plus Blob payloads, not base64 expansion). Gate exports as well as restores. Before replacement, persist a small restore-in-progress marker; normal storage access is blocked while it remains, including after a reload/crash. Replace the derived cache first, then replace all authoritative stores in one transaction. Retain the previous cache snapshot until main commit and roll it back if main replacement fails. Clear the marker only after both commits or a verified ordinary rollback; a failed rollback or interrupted restore requires the user to reselect the intended or safety archive. Successful restore requires reload before normal UI writes resume. This deliberately does not claim cross-database atomicity or protection from a different/older app tab that ignores the guard: the owner must close other app tabs and confirm this before export/restore.

## Task 1: Worker evidence and incremental progress (test first)

**Files:**

- Modify: `src/application/ports/IVideoPreviewGenerator.ts`
- Modify: `src/infrastructure/adapters/MediabunnyVideoPreviewGenerator.ts`
- Modify: `src/infrastructure/video/extraction/previewWorkerClient.ts`
- Modify: `src/infrastructure/video/extraction/clipWorkerClient.ts`
- Modify: `src/infrastructure/video/extraction/previewExtraction.worker.ts`
- Modify: `src/infrastructure/video/extraction/clipExtraction.worker.ts`
- Modify: `src/infrastructure/video/extraction/playerTimeline.ts`
- Modify: `src/application/usecases/UpdateVideoPreviewsUseCase.ts`
- Test: existing adjacent worker-client, timeline and use-case specs.

1. Add a failing worker-client test: one progress reply must invoke progress without resolving or terminating the worker; a final reply settles once.
2. Run the targeted test and confirm the missing-behavior failure.
3. Implement discriminated progress/final messages and thread optional observer callbacks through the existing port.
4. Add tests for invalid/non-monotonic counts, abort and stale progress, observer errors, final failures with last-known stage, and timeline diagnostics.
5. Emit progress once per completed clip/encoded seek thumbnail; include bounded numeric diagnostics and stable error codes. Preserve cleanup, deadlines and output limits.
6. Run targeted specs; review and commit only task-owned files when green.

## Task 2: Retained per-product report and visible item progress

**Files:**

- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Test: `src/presentation/stores/videosStore.spec.ts` and existing ingestion/preview specs.
- Test: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

1. Write failing tests retaining clip counts/failure evidence while seeks run, and independent bars/states per item.
2. Verify red, then retain small per-product diagnostics in the existing store and frozen session snapshots.
3. Show active/pending/failed items with usable filtering for hundreds of entries; avoid rendering full diagnostic JSON on every progress tick.
4. Fix the hardcoded DOM-backend label and clarify handled-versus-successful metrics. Add current build identity and explicit unmeasured fields to exported reports.
5. Test clipboard failure/manual selection, panel dismissal, pause/resume, priority, duplicate imports and bounded history.
6. Run targeted specs and commit only after review.

## Task 3: Failed-file inspection and audit export

**Files:**

- Create: `src/application/ports/IVideoFileInspector.ts`
- Create: `src/application/usecases/InspectFailedVideoFilesUseCase.ts`
- Create: `src/infrastructure/video/inspection/inspectVideoFile.ts` and adjacent spec.
- Modify: `src/infrastructure/di/createVideoServices.ts`, `src/infrastructure/di/container.ts`
- Modify: `src/presentation/di/injectionKeys.ts`, `src/main.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue` and adjacent spec.

1. Write failing pure fixture tests for valid MP4 metadata before/after media, extended sizes, truncated/invalid boxes, wrong container, valid fragments and budget-exhausted/inconclusive cases.
2. Implement a bounded `File.slice` reader/box walker; no full-file loads or source writes.
3. Test cancellation and missing/reselected originals in the use case. Reuse session-registry ownership; do not create another ingestion scheduler.
4. Test readable and JSON exports with Unicode, quotes, tabs/newlines, duplicate names and missing folder-relative paths. Export data rather than interpolated FFmpeg commands.
5. Wire explicit inspect/cancel/copy/download actions; results must describe evidence and uncertainty, with actionable categories.
6. Run focused tests and review parser bounds before committing.

## Task 4: Backup and restore after backup scope is settled

**Files:**

- Create: `src/application/ports/ILibraryBackup.ts`
- Create: `src/infrastructure/database/LibraryBackup.ts` and adjacent spec.
- Modify: `src/infrastructure/database/DatabaseConnection.ts` only if safe transaction access needs an existing-boundary extension.
- Modify: `src/infrastructure/repository/VideoPreviewCacheRepository.ts` only if preview inclusion is selected.
- Modify: existing DI composition, injection keys, `src/main.ts`, `videosStore.ts` and `DiagnosticsPanel.vue` as above.
- Test: existing component/store tests plus a new isolated browser backup/restore smoke spec.

1. Settle preview inclusion and document the two-database recovery contract before implementation.
2. Write round-trip fixture tests for all durable stores, binary previews if included, votes/tags/covers and schema metadata.
3. Write rejection tests proving malformed/truncated/newer-version archives leave the original records untouched.
4. Implement export/validation, then transactional library replacement. Test transaction abort/quota errors, confirmation cancellation, and active/paused work gating.
5. Add staged preview-cache recovery only under the selected contract; preserve a clear outcome if optional cache restoration fails.
6. Exercise backup, test-data mutation, restore and reload in a disposable browser namespace. Compare records and included Blob bytes, not just item counts. Never wipe or import over the owner's browser database during verification.

## Task 5: Review and smoke checkpoint

1. Bootstrap the existing feature worktree with the repository CLI before npm/dev commands; do not create another devcontainer.
2. Run focused Vitest checks first, then lint, type-check, unit suite and production build serially. Use real browser IndexedDB coverage for atomicity and restore; mocked request success is insufficient.
3. Request independent read-heavy review of parser bounds, backup validation/rollback semantics, source ownership, privacy and queue regressions.
4. Update `docs/testing/ingestion-clip-ux-smoke.md` with an isolated backup/restore round trip, mixed valid/malformed files, progress/pause checks and audit-manifest review. Keep original-file acceptance open.
5. Reconcile Notion with owner observations first; preserve the failed folder attempt and all older acceptance evidence. Publication/deployment and native acceptance remain distinct and follow the authorized feature workflow.

## References

- [FFprobe: container/stream/error reports](https://ffmpeg.org/ffprobe.html)
- [FFmpeg MP4 fragmentation and faststart](https://ffmpeg.org/ffmpeg-formats.html#Fragmentation)
- [MDN: selected-folder-relative paths](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath)
- [MDN: IndexedDB transaction scope](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)

These references justify diagnostic limits and external audit handoff, not a claim that header inspection certifies a whole download or that remuxing repairs all browser failures.
