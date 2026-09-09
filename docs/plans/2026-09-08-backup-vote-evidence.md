# Read-only backup vote evidence implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish whether the owner's retained backup actually contains nonzero votes without restoring it, uploading private media, or modifying either database.

**Architecture:** Extend the existing `ILibraryBackup` inspection summary with aggregate vote/record-link counts calculated after full archive validation. Render and copy that bounded summary in the existing backup panel. Do not change archive format, database schemas, voting, restore, file identity, ingestion or queue behavior.

**Tech Stack:** TypeScript, Vue, Vitest, existing namespaced Cypress recovery tests.

## Evidence and limits

- Owner confirms full incognito recovery at `bvr.preprod.home.arpa`: expected video count, every vote zero. Main profile is also all zero. This supersedes the earlier validation-only interpretation.
- The retained archive has not been inspected by the agent. Its creation build/date and actual stored vote values are unknown.
- Existing `580eccf` fixes a reproduced missing-content overwrite. It is not proven to explain the owner's wholesale loss.
- Current inspection reports store counts but cannot distinguish zero-valued metadata, missing metadata, or nonzero archived votes. Partial clip coverage does not exclude metadata from a full archive.
- Baseline: 19 focused archive, repository and panel tests pass. Passing synthetic tests are not owner recovery acceptance.

## Chosen scope and alternatives

Use existing read-only validation to expose counts of positive, negative, zero and nonzero vote records, video records missing metadata, and metadata without video records. These are counts of records, not sums of scores (positive and negative scores must not cancel out). Keep orphan metadata in the summary; never normalize it away.

The copyable JSON includes current origin/inspector build separately from archive build/date and aggregate counts. It includes no titles, IDs, paths, tags or preview bytes. If clipboard access fails, the read-only text remains selectable. Explicitly explain that zero nonzero records means this archive cannot recover earlier nonzero votes, not that the archive is corrupt.

Uploading the full private archive is unnecessary for this first boundary check. Changing restore/voting code speculatively, guessing votes, adding migrations or issuing another live restore would not establish when loss occurred. Defer those changes unless evidence supports them.

## Task 1: Read-only archive evidence (TDD)

**Files:**
- Modify: `src/application/ports/ILibraryBackup.ts`
- Modify: `src/infrastructure/database/LibraryBackup.ts`
- Test: `src/infrastructure/database/libraryArchive.spec.ts`

1. Add a test that builds 500 content records, 498 matching vote records (equal positive/negative/zero groups), two orphan metadata records and only 20 clip products. Call the real `inspectArchive` on the encoded archive. Expected positive=167, negative=167, zero=166, nonzero=334, missingMetadata=2, orphanMetadata=2. Compare decoded records/archive bytes and prove no DB connection is requested.
2. Add empty/all-zero and malformed-archive inspection tests. Existing archives remain readable; invalid archives produce no summary.
3. Run `npx --no-install vitest run src/infrastructure/database/libraryArchive.spec.ts --exclude '.worktrees/**'`. New assertions must fail because vote evidence is absent.
4. Extend `LibraryBackupSummary.votes` with the six integer count fields. After decoding/validation, read metadata `{id, votes}` and content IDs, count score signs, and compare ID sets. Return evidence with the existing summary; no storage or maintenance writes.
5. Run the targeted tests again. All must pass.

## Task 2: Display and copy evidence (TDD)

**Files:**
- Modify: `src/presentation/components/utils/LibraryBackupPanel.vue`
- Test: `src/presentation/components/utils/LibraryBackupPanel.spec.ts`

1. Extend the test fixture with all summary fields. Add failing tests for visible positive/negative/zero/missing/orphan counts, the all-zero explanation, copyable origin/build evidence and denied clipboard fallback.
2. Run `npx --no-install vitest run src/presentation/components/utils/LibraryBackupPanel.spec.ts --exclude '.worktrees/**'`; observe new behavior absent.
3. Render the counts after successful validation; add `Copy backup summary` and a labeled readonly JSON textarea. Reuse the panel's existing error/status approach. Clear old evidence when selection changes; keep restore behind existing explicit confirmations.
4. Run both targeted files plus existing vote repository tests. Inspection/copy must never call restore, and invalid selection must not retain previous evidence.

## Task 3: Browser verification and release checkpoint

**Files:**
- Modify: `cypress/e2e/libraryRecovery.cy.ts`
- Modify: `docs/testing/ingestion-clip-ux-smoke.md`

1. Extend the real browser recovery roundtrip to check archived nonzero values in the displayed JSON before restoring, including inspector origin/build. Compare both live databases before/after validation. Only synthetic namespaced databases are in scope.
2. Add a read-only owner checkpoint: validate the original backup, copy the summary, do not click replacement or overwrite the original. Keep recovery failed/open until actual archived votes and subsequent preservation evidence are known.
3. Run lint, type-check, unit suite and isolated build sequentially. Reuse the existing browser container; run the namespaced recovery spec in Chrome and Edge, one heavyweight command at a time.
4. Request an independent read-only review of privacy, count correctness, archive compatibility, and preservation of write gates. Address demonstrated findings with tests.
5. Under the feature's standing release workflow, commit only scoped files, push, require exact-SHA trusted CI, deploy the immutable image to existing preprod and verify identity/readiness/HTTPS plus available namespaced browser smoke. Preserve rollback, operator data, master and unrelated `docs/backlog.md` edits.
6. Reconcile Notion using a new target/checkpoint while preserving the owner's failed recovery attempt and leaving Tested SHA unfilled until evidence exists. Report this as an evidence-gathering improvement, not recovered votes or a proven loss fix.

## Local verification checkpoint — 2026-09-08

- Initial evidence/UI regressions failed before implementation. Review added three failing regressions for copy feedback racing restore status and untrusted archive identity text; both findings are resolved.
- Lint, type-check, all 751 unit tests and an isolated production build passed. An initial sandbox-only tar/socket permission failure was rerun with approved host permissions; no checks were bypassed.
- Chrome 152 and Edge 152 each passed all seven namespaced recovery checks. The real browser roundtrip now preserves 501 mixed positive/negative/zero vote records with sparse preview products and proves validation leaves both live test databases unchanged.
- Independent read-only review has no remaining critical or important findings. These synthetic checks do not establish the original archive's contents or recover the owner's votes.
- Exact-SHA CI, immutable existing-preprod deployment and deployed browser checks are the next release gate; record their actual result separately from this local checkpoint.
