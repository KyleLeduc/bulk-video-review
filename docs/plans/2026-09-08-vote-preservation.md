# Vote Preservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconstructing missing video content must retain existing votes, including after a full-backup restore.

**Architecture:** Keep content and review metadata in their existing repositories. Add an atomic create-if-absent metadata operation; ingestion may initialize votes but must never overwrite them. Explicit voting and explicitly confirmed full restore retain their existing write semantics.

**Tech Stack:** TypeScript, IndexedDB, Vue/Pinia, Vitest, Cypress.

## Evidence and scope

The owner reports all established votes now display zero and retains a full backup, not yet restored. Unchanged source at 42f03df reproduces one loss path: `getVideo` returns absent when content is missing, then `postVideo` overwrites an existing vote row with zero. Normal same-ID reimport and read-only archive export preserved votes in isolated Chrome tests. The owner's actual storage state, file identity, and backup contents remain unverified; fixing this path is not proof of the original cause or recovery.

Chosen design: `IMetadataRepository.createMetadata` returns the existing record unchanged, or inserts the supplied initial record. The IndexedDB adapter performs the existence check and insertion in one readwrite transaction and resolves only at commit. This makes initialization idempotent across concurrent imports. A separate lookup then upsert is smaller but can race; a new database/identity scheme is unnecessary and risks established data. No new database version, migration, dependency, or manager.

Owner accepts current focus cancellation/restart/reordering provided the logical video is retained. Leave it unchanged. Also leave the timeline restriction, preview settings, and unrelated backlog edits untouched.

## Task 1: Regression at the aggregate boundary

**Files:**
- Modify: `src/infrastructure/repository/VideoAggregateRepository.spec.ts`

1. Add a Map-backed metadata fixture exposing both insert-if-absent and upsert semantics, and a Map-backed content repository.
2. Test positive, negative and zero votes survive `postVideo` when content is absent. Assert the returned aggregate, stored votes, reconstructed content, and no upsert.
3. Test genuinely new IDs initialize to zero, and repeated creation preserves votes.
4. Run `node node_modules/vitest/vitest.mjs run src/infrastructure/repository/VideoAggregateRepository.spec.ts --exclude '.worktrees/**'`. Expect existing nonzero votes to fail as zero before the fix.

## Task 2: Atomic initialization

**Files:**
- Modify: `src/domain/repositories/IMetadataRepository.ts`
- Modify: `src/infrastructure/repository/MetadataRepository.ts`
- Modify: `src/infrastructure/repository/VideoAggregateRepository.ts`
- Create: `src/infrastructure/repository/MetadataRepository.spec.ts`

1. Test that `createMetadata` does not put existing records, adds absent records, and settles only on transaction completion; request failure or transaction abort must reject.
2. Extend the metadata contract with `createMetadata(data: MetadataEntity): Promise<MetadataEntity>` and document existing-record preservation.
3. Implement with one readwrite transaction: `get(data.id)`, use result if present, otherwise `add(data)` within the success callback; return only from `transaction.oncomplete`, reject on abort. Do not use `put` for initialization.
4. Switch `VideoAggregateRepository.postVideo` from `upsertMetadata` to `createMetadata`; update its typed fixtures.
5. Run both repository test files and confirm green, then lint/type-check. No changes to ordinary vote update behavior.

## Task 3: Real-browser recovery proof

**Files:**
- Modify: `cypress/e2e/libraryRecovery.cy.ts`
- Modify: `docs/testing/ingestion-clip-ux-smoke.md`

1. Add a real fixture import with nonzero persisted votes. Export a full archive and verify export leaves the stored votes unchanged.
2. Restore that archive in a disposable namespace and reload; reselect the same fixture and assert the saved vote count in both UI and IndexedDB.
3. Remove only the synthetic content row while retaining synthetic review metadata. Reload/reimport and verify votes survive reconstruction; test must fail on old implementation.
4. Exercise overlapping content initialization through the real adapter if feasible; avoid synthetic production APIs.
5. Run the recovery Cypress spec using the existing shared browser container and an isolated current build. Never point destructive fixtures at the operator database.
6. Update the smoke document with preserve-original-archive, disposable-profile restore/reimport steps and explicit limits: restore only recovers counts actually present in the backup. No automatic guessing or source remapping.

## Task 4: Verification and handoff

1. Run `npm run lint`, `npm run type-check`, `npm run test:unit`, and production build sequentially; one resource-intensive command at a time. Use `npm run build-only -- --outDir <ignored-run>/dist` after type-checking to preserve the existing smoke server's distribution.
2. Request independent read-only review of persistence semantics and recovery tests. Resolve material findings, rerun affected checks, and inspect the final diff.
3. Update existing Notion vote and focus follow-ups, preserving owner observations and earlier attempts. Owner all-zero cause/recovery acceptance remains open.
4. Do not restore operator data or promote master. Report local/published/deployed state separately; reconcile deployment authorization before any release.

## Verification checkpoint

- Aggregate regressions failed before the fix, including 17 to 0 and -4 to 0. Adapter tests failed before the atomic operation existed. All 13 repository tests now pass.
- Chrome 152 recovery test failed on the previous implementation only at missing-content reconstruction (restored 2 became 0). On the fixed build, all seven recovery cases pass, including backup integrity, transaction failure/rollback and retained votes.
- Lint, type-check, all 741 unit tests and isolated production build pass. Full tests initially hit sandbox restrictions on local servers and `tar`; the unchanged suite passed with those permissions.
- Independent read-only review found no blocking issues. A real IndexedDB overlapping-create test remains optional additional race coverage; atomic transaction ownership and commit/abort behavior have targeted coverage.
- No migration, user-data restoration or queue behavior changes. Owner-wide root cause and backup contents remain unverified.
- The feature worktree's standing release authority includes commit/push, exact-SHA CI and existing-preprod smoke after approved implementation. Use that bounded workflow; do not integrate master or touch operator storage.
