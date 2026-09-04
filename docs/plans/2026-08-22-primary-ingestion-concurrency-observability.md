# Primary Ingestion Concurrency and Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bounded 1-4 job concurrency to primary video ingestion and expose a copyable, run-scoped foreground/background diagnostics report.

**Architecture:** Extend the ingestion contract with execution options and structured progress, then use a staged bounded pool for identification, classification, fresh decoding, and deferred retries. Snapshot concurrency and input metadata per Pinia session, aggregate only that session's preview diagnostics, and render the latest report in the existing diagnostics panel.

**Tech Stack:** TypeScript, Vue 3, Pinia, IndexedDB adapters, Vitest, Vue Test Utils.

---

### Task 1: Extend the ingestion contract

**Files:**
- Modify: `src/application/usecases/VideoIngestionUseCase.ts`
- Test: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`

**Step 1: Write failing contract/behavior tests**

Add tests that call `execute(items, { concurrency })` and expect an immediate
progress snapshot containing phase, effective concurrency, active/pending jobs,
input bytes, peaks, and separate failure/skip/duplicate counts.

**Step 2: Verify RED**

Run:
`npx vitest run src/application/usecases/LinearVideoIngestionUseCase.spec.ts --exclude '.worktrees/**'`

Expected: FAIL because options and structured progress do not exist.

**Step 3: Add the minimal types**

Add `VideoIngestionOptions`, `VideoIngestionPhase`, and the new progress fields.
Keep `options` optional so existing adapters and simple test doubles remain
source-compatible.

**Step 4: Verify the focused type/test surface**

Run the targeted Vitest file and `npm run type-check`.

### Task 2: Implement the staged bounded pool

**Files:**
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.ts`
- Modify: `src/application/usecases/LinearVideoIngestionUseCase.spec.ts`

**Step 1: Write failing concurrency tests**

Cover Auto=2, overrides 1 and 4, clamping above four, immediate slot refill,
failure isolation, faster-result emission, cached-before-fresh behavior, and the
fresh-before-retry barrier.

**Step 2: Verify RED**

Run the focused use-case suite and confirm serial behavior fails the active-job
assertions.

**Step 3: Implement a private bounded completion-order iterator**

Start at most the normalized limit, race active tasks, remove the completed
task, refill from the queue, and yield the result plus active/pending state.
Convert task rejection into a typed item result before it reaches the pool.

**Step 4: Add deterministic identification/deduplication**

Identify concurrently, restore original index order for ownership, and mark
later IDs as duplicates without classification or processing.

**Step 5: Add classification, fresh, and retry phases**

Classify unique items concurrently, emit cached videos, drain fresh processing,
then drain retry processing. Emit monotonic progress after each result and a
final complete snapshot.

**Step 6: Verify GREEN and commit**

Run the use-case suites, type-check, and lint. Commit the contract and worker
pool together once all focused checks pass.

### Task 3: Snapshot foreground settings and session lifecycle

**Files:**
- Create: `src/presentation/stores/videosStore.ingestionScheduler.spec.ts`
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.spec.ts`

**Step 1: Write failing store tests**

Expect Auto=2, manual 1-4 clamping, the queued session's immutable concurrency
snapshot passed to `execute`, selected/accepted/unsupported byte counts, FIFO
batches, and no foreground/background overlap.

**Step 2: Verify RED**

Run the two store suites and confirm the missing primary settings/options fail.

**Step 3: Implement session snapshots**

Add foreground concurrency state/setter, capture input totals and both
concurrency modes at queue time, pass the captured foreground value to the use
case, and retain foreground versus full-pipeline completion timestamps.

**Step 4: Complete sessions after run-scoped previews settle**

Update per-session preview peaks and mark the session complete only when none of
its tracked jobs are queued or processing. Preserve requeue behavior on abort.

**Step 5: Verify GREEN and commit**

Run store tests, type-check, and lint before committing.

### Task 4: Build the versioned run report

**Files:**
- Modify: `src/presentation/stores/videosStore.ts`
- Modify: `src/presentation/stores/videosStore.ingestionScheduler.spec.ts`

**Step 1: Write failing report tests**

Expect `createDisplayedIngestionRunReport()` to return a primitive-only v1
object, preserve the queued run's concurrency after controls change, aggregate
only the session's preview IDs, and include live/final timing and peak values.

**Step 2: Verify RED**

Run the ingestion scheduler store suite.

**Step 3: Implement the report method**

Build foreground and background sections from the displayed session, structured
progress, and tracked preview diagnostics. Add environment fields without
including filenames, Files, Blobs, URLs, Maps, or stacks.

**Step 4: Verify GREEN and commit**

Run store tests and static checks before committing.

### Task 5: Improve the diagnostics panel

**Files:**
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

**Step 1: Write failing UI tests**

Expect separate foreground and background sections, latest-run visibility,
primary choices Auto/1-4, preview choices Auto/1-2, effective job labels,
copyable pretty JSON, successful clipboard feedback, and visible manual JSON
fallback when Clipboard is missing or rejects.

**Step 2: Verify RED**

Run the diagnostics component suite.

**Step 3: Implement the minimal UI**

Bind the displayed session/report, add distinct controls and metrics, render a
read-only JSON textarea, and progressively enhance with `navigator.clipboard`.

**Step 4: Verify GREEN and commit**

Run component tests, type-check, and lint before committing.

### Task 6: Clarify foreground versus preview toast progress

**Files:**
- Modify: `src/presentation/components/utils/IngestionStatusToast.vue`
- Modify: `src/presentation/components/utils/IngestionStatusToast.spec.ts`

**Step 1: Write failing phase-label tests**

Expect identifying/classifying/fresh/retry labels, active/pending/effective job
counts, `Foreground completed in` timing, and explicit background preview text.

**Step 2: Verify RED**

Run the toast suite.

**Step 3: Implement labels without changing meter ownership**

Use run-scoped ingestion progress during foreground work and the existing
session-scoped preview progress afterward. Keep dismissal and reduced-noise
behavior unchanged.

**Step 4: Verify GREEN and commit**

Run the toast tests and static checks before committing.

### Task 7: Review and verify

**Files:**
- Review all files changed since the design commit.

**Step 1: Request independent code review**

Review bounded-pool settlement, duplicate ownership, progress invariants,
session lifecycle, report privacy, run-scoped aggregation, and private-HTTP
copy fallback.

**Step 2: Address findings with TDD**

For each behavior defect, write a failing regression, implement the smallest
fix, and rerun the focused suite.

**Step 3: Run full verification**

Run:
- `npm run lint`
- `npm run type-check`
- `npm run test:unit`
- `npm run build`
- `git diff --check`

Expected: all checks pass and the worktree is clean after final commits.

**Step 4: Record the browser acceptance gate**

Benchmark representative batches at foreground 1, 2, and 4. Capture copied run
reports, browser/OS, responsiveness, and any decoder or long-task symptoms.
