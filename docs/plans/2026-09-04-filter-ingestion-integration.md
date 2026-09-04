# Filter and Ingestion Integration Plan

> **For Codex:** Use the executing-plans workflow checkpoints while carrying out this authorized integration.

**Goal:** Review and consolidate the filter work into one commit on current master, then consolidate ingestion on that result, preserving both feature sets and browser-local data.

**Architecture:** Retain the separate domain filter rules and readonly presentation filter store. Preserve ingestion's bounded scheduling, IndexedDB v4 additive preview store, and Blob preview ownership. Adapt only the intersecting contracts and confirmed review defects.

**Tech Stack:** Vue, Pinia, TypeScript, IndexedDB, Vitest, Vite, Git worktrees.

### 1. Review and consolidate filters

- Review `src/domain/services/VideoFilterService.ts`, `src/presentation/stores/videoFilterStore.ts`, `src/presentation/stores/videosStore.ts`, filter components, and their tests against the existing filter/range-slider plans.
- Bootstrap the existing checkout with `npm run worktree -- bootstrap .worktrees/codex-video-filter-plan` from the primary checkout.
- Preserve existing lockfile changes with exact-path stashes and fast-forward primary master to freshly fetched origin/master.
- Run `npm run lint`, `npm run type-check`, `npm run test:unit`, and `npm run build` sequentially. Fix confirmed defects with failing regression tests first.
- Consolidate into one commit parented by current master and fast-forward master. Preserve the original published branch; do not force-push.

### 2. Review and integrate ingestion

- Bootstrap `.worktrees/codex-ingestion-preview-pipeline` using the canonical CLI.
- Review preview repository transaction completion, thumbnail update cancellation and concurrent aggregate updates, database migration, and preview URL lifetime.
- Add targeted regression tests before fixes in `src/infrastructure/repository`, `src/application/usecases`, and corresponding tests.
- Consolidate ingestion onto the filtered master. Resolve `src/presentation/stores/videosStore.ts` by retaining readonly `allVideos` and ingestion scheduling/diagnostics, without restoring the removed filter API.
- Adapt `VideoFilterService` preview readiness to support Blob frames and legacy thumbnail URLs; update typed fixtures and cover both formats.
- Run the targeted tests, then lint, type-check, complete unit suite, and build. Obtain review of the actual combined result before fast-forwarding master.
- Browser-local catalog and native visual acceptance remain separate from automated tests; never clear browser data for verification.

### 3. Scoped closeout

- Verify exact branch tips, ancestry/content integration, checkout cleanliness, process ownership, and container labels/mounts before removal.
- Repair the stale old preprod worktree registration at its actual path.
- Use `npm run worktree -- remove <exact-path>` for clean filter, ingestion, FQDN, and old preprod checkouts. Retain consolidated filter and ingestion local branches.
- Delete only `codex/preprod-fqdn-migration`, `improveFileHandling`, `test`, `template-agent-harness`, and `feature/bulk-video-review-preprod` local branches, whose integration has been verified. Preserve three unmerged experiment branches and original remote refs.
- Preserve every volume and ambiguous image/cache resource; no broad cleanup.
- Restore and verify the primary checkout's original lockfile edit, preserve the FQDN edit by stable stash SHA, and verify all pre-existing stashes remain.
- Report commit topology, tests, exact cleanup, retained resources, and outstanding browser acceptance. No deployment is part of this request.
