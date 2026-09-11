# Approximate Preview Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce complete browsing-preview arrays despite valid track/player boundary differences, retaining real failure handling and releasing to existing preprod for owner smoke testing.

**Architecture:** Keep timing compatibility in the shared extraction adapter. Clamp actual worker sampling without changing the player or nominal DTO slot layout. Accept a shorter positive clip only when bounded by available media. Preserve queue, storage, safety budgets and fallback behavior.

**Tech Stack:** TypeScript, pinned Mediabunny 1.55.7, WebCodecs workers, Vitest, Cypress, existing immutable homelab release workflow.

---

### Task 1: Shared usable-range policy (red/green)

Files: `src/infrastructure/video/extraction/playerTimeline.ts` and `.spec.ts`.

1. Baseline: `npx vitest run src/infrastructure/video/extraction/playerTimeline.spec.ts src/infrastructure/video/extraction/clipExtraction.worker.spec.ts src/infrastructure/video/extraction/previewExtraction.worker.spec.ts --exclude '.worktrees/**'`.
2. Replace obsolete whole-track rejection expectations with all nine supplied timing tuples. Add clamped target/window, negative first packet, exclusive end, sub-tick interval, empty/nonfinite/disjoint interval, unsupported warning and cleanup tests.
3. Run the shared guard tests and record expected failures before implementation.
4. Return usable-range sampling helpers; maintain diagnostic evidence and unsupported-edit checks. Run targeted guard tests green.

### Task 2: Worker sampling and complete output contracts (red/green)

Files: `clipExtraction.worker.ts`, `previewExtraction.worker.ts`, their specs, `clipWorkerClient.ts` and its spec, `src/domain/services/videoPreviewPolicy.ts` and its spec. Only add entity/API comments if needed to clarify nominal-slot semantics.

1. Add worker tests proving boundary-adjusted extraction inputs, unchanged nominal slots/counts, shorter positive clips, metadata diagnostics on genuine invalid timelines, and no partial success. Add client/domain acceptance for shorter positive durations while still rejecting extra/missing slots, zero or overlong output.
2. Run focused tests red; implement the minimal mapping and duration validation. Keep byte limits, precise returned-frame ordering checks, progress, cancellation and cleanup.
3. Run all extraction, adapter and preview-policy unit tests green. Do not bump cache versions or alter accepted still-fallback retry behavior.

### Task 3: Real-browser regression and review

Files: `cypress/e2e/extractionPlan.cy.ts`, synthetic fixture generation/README as required, `docs/testing/custom-mediabunny-benchmark.md`.

1. Add a deterministic small MP4 with leading video gap and audio/player tail; verify actual timestamps with ffprobe/pinned input. Browser test runs production motion and seek variants and checks complete counts and nonblank decoded first output. Include a genuinely short file where practical.
2. Run tests serially in the existing browser container against the local build. Keep original network state and isolated synthetic data only.
3. Run `npm run lint`, `npm run type-check`, `npm run test:unit`, Cypress TypeScript check and `npm run build` serially. Request independent read-only review via the existing available child; address findings with red/green evidence and rereview.
4. Record exact evidence/limitations and focused same-nine NAS retest steps. No claim of original-file decoding from fixtures.

Discovered during real-browser qualification: Edge delivered `[off-screen,
on-screen]` entries together for the single observed preview container. Reading
only the first entry left complete generated clips hidden. Extend Task 3 with
the minimal `MotionPreview.vue` correction to use the last entry and two
`MotionPreview.spec.ts` regressions covering both motion and still activation,
reverse transitions and URL cleanup. Both tests failed before the correction;
rerun the complete local checks and Chrome/Edge smoke afterward. No new
observer, queue policy or focus override is required.

### Task 4: Verified preprod checkpoint

1. Reconcile Notion feature/actions/test feedback; preserve historical attempts and operator fields.
2. Stage only this task's files, excluding the pre-existing `docs/backlog.md` edit. Commit/push feature branch; require successful trusted CI for that exact SHA and immutable image.
3. Follow existing homelab deployment runbook, preserving previous release. Verify runtime image, served SHA/assets, HTTPS, readiness and available automated browser regression on the deployed artifact.
4. Publish new owner Action/Not-run Test Run tied to this build and automated evidence separately. Record unresolved read-limit/fallback-upgrade/native checks; no master integration.
5. Complete the ignored ledger and provide URL, exact build and concise owner test steps only after gates pass.
