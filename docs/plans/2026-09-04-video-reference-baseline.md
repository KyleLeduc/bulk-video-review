# Video Reference Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collect the approved real Chrome/Edge baseline matrix using an explicitly licensed, fixed public reference corpus without accessing operator videos or claiming that the reference set represents the user's own workload.

**Architecture:** Keep the application at verified measurement commit `00b7646`; use its existing diagnostics and opt-in browser probe. Store reference media and raw results only in the ignored task directory. Drive isolated Chrome/Edge processes through the browser's native file-input protocol so large Files are not copied through Cypress buffers. No worker implementation, dependency additions, database change, integration or preprod release.

**Tech Stack:** Existing Node 22+/24 built-ins, Chrome DevTools Protocol, pinned official Chrome/Edge image, existing Cypress-bundled FFmpeg for offline test-media preparation only, Vitest.

## Decision and limits

The repository contains only two 160×90 color clips, unsuitable for this baseline. Waiting for a personal folder is not the only safe way to begin the requested measurement work: Blender's published licence permits a reproducible reference corpus. Keep the user's own-workload qualification open and label every result as reference/headless/container-based. Do not use these results to claim human pointer/drag acceptance or general speedups.

Alternatives considered: personal videos (most representative, path/permission unanswered); existing synthetic smoke clips (too small/simple); publicly licensed real-footage reference plus documented derivatives (selected to advance measurements without private-data access). This refines input selection within the approved fixed-corpus plan; it does not waive the matrix, lifecycle or measurement gates.

Source: Blender Foundation Big Buck Bunny, Creative Commons Attribution 3.0, [licence](https://peach.blender.org/about/) and [publisher download listing](https://download.blender.org/demo/movies/BBB/). Select `bbb_sunflower_2160p_30fps_normal.mp4.zip` (publisher listing: 632,204,510 bytes). Download at most 700 MB; cap total prepared media/archive storage at 3 GiB. Record exact download SHA-256 and validated archive member list before extraction. Retain required attribution, identify derivatives and keep media out of Git. Do not apply the nearby Tears of Steel soundtrack's NoDerivs licence to other films or assume its directory licence covers video derivatives.

Reuse the measurement worktree/private install and one root-owned disposable browser container. Run the canonical worktree bootstrap before npm commands. No shared container changes, Docker volumes, user profiles or concurrent heavy commands. Keep final reference media for reproducibility; stop only owned browser/test processes at checkpoint and report disk cost.

## Task 1 — Qualify and prepare a fixed reference corpus

**Artifacts (ignored):** `.codex-task-runs/20260904-184155-dependencies-and-performance/reference-corpus/` under the primary repository. No application source changes.

1. Verify clean worktree/upstream and ignored artifact path; inventory free disk and the retained pinned browser image. Record source URL/licence/size, download with HTTPS, failure/size/time limits and no overwrite of an existing file.
2. Inspect archive paths and declared uncompressed sizes before extraction into a fresh subdirectory; reject absolute/traversal/symlink members or unexpected content. Verify extracted media type/duration/dimensions/codec using the existing test FFmpeg binary, not an added runtime dependency.
3. Record an ordered manifest including the full native 4K/30 long source, shorter 720p/1080p cuts, portrait pixels, rotation metadata, a deliberately variable-frame-rate derivative, supported alternate codec if available, unsupported-codec case, malformed input and an exact duplicate in a second directory. Inspect encoder availability before choosing exact offline commands; retain commands/hashes/ffprobe-equivalent output and attribution. Do not relabel an upscaled clip as native 4K or a CFR file as VFR.
4. Validate Files/deduplication expectations in an isolated browser pilot. Invalid/unsupported files must be reported separately; no fixture substitutions solely to make a run pass. The prepared corpus is fixed before the measured matrix starts.

## Task 2 — Repeatable native-file browser runner

**Create:** `scripts/videoProcessingBenchmark.mjs`, `scripts/videoProcessingBenchmark.spec.ts`.

1. Add failing tests for deterministic case enumeration (3 foreground × 2 preview settings × 5 cold/warm pairs per browser), finite-value median/percentile summaries, missing-cell detection, corpus-root path containment, request timeout/connection close, and preservation of cold/warm separation. Minimal exports may precede assertion failures; no implementation before the regressions.
2. Run `npm exec -- vitest run scripts/videoProcessingBenchmark.spec.ts --exclude '.worktrees/**' --maxWorkers=2`; observe expected failures, then implement the smallest runner using Node built-ins. No general browser automation framework or new dependency.
3. CLI shape: `node scripts/videoProcessingBenchmark.mjs --browser chrome --corpus /corpus --output /results/chrome.jsonl --repetitions 5 --url http://127.0.0.1:4173`. Restrict app URL to loopback, browser to the pinned executable choices, corpus files to the validated manifest root and output to explicitly supplied task-owned results. Refuse overwrite/missing inputs. Use deadlines and cleanup for owned browser processes/profiles, never broad process termination or profile deletion.
4. Use `DOM.setFileInputFiles` to select real local Files, DOM controls to set concurrency before selection, and the existing probe for frame/long-task evidence. Keep Diagnostics closed through measured work; read its final report only after the visible ingestion lifecycle settles. Use a new disposable profile for each cold run; reload/reselect within that profile for its paired warm run. Verify cold/new versus warm/cached counts and fixed input totals in each report.
5. Collect trusted browser input observations and sampled browser-process memory alongside wall/phase timings, with sample counts and limitations. Do not call a requestAnimationFrame gap p95 input latency, a JS heap metric native memory, a Cypress duration pipeline time or an unsupported API zero-cost. If a gate cannot be measured reliably, leave that gate explicitly open rather than fabricate a value.
6. Rerun targeted tests to green, lint and build-script checks, then pilot one cold/warm pair per browser. Inspect every raw pilot report and failure before the full matrix; do not silently discard failed runs.

## Task 3 — Collect evidence, review and publish results

**Modify:** `docs/testing/video-processing-performance.md`, `docs/backlog.md` with proven scope only. Raw media/results remain ignored.

1. Run all five comparable cold/warm pairs for foreground 1/2/4 × previews 1/2 in Chrome, then Edge, on one fixed app build and fixed resources; serialize runs. Rotate the six configurations by repetition (`rotating-configurations-v1`) while keeping cold/warm pairs adjacent, reducing systematic configuration-order bias. Browser order remains sequential; do not claim causal cross-browser performance differences. Retain raw rows, all failure/exclusion records, corpus/build/browser/OS/concurrency identity and exact command provenance. A pilot is not one of the five measured runs.
2. Verify all 120 measured rows and expected cache/job/input counts before summarizing. Report medians and spread per configuration; identify dominant awaited phases without summing overlapping work as wall time. Include interaction/memory measurement qualifications and reference-corpus limits.
3. Request independent read-only review of runner, dataset coverage, aggregation and evidence. Resolve important findings and rerun affected verification. Run lint, relevant unit/full tests and production build proportionally; publishing must not alter the measured app bundle.
4. Publish only reviewed runner/tests/docs and redacted result summaries; verify exact CI. Keep reference corpus/hash manifest reproducible outside Git, report its retained disk use, and clean up only the owned test container/profiles without volumes. No merge or preprod deployment.
5. Audit the original goal against the actual evidence. A verified reference baseline can begin the performance plan, but does not prove the user's own workload or authorize worker enablement automatically. Leave any explicit unmet measurement gate visible; do not redefine success around synthetic smoke or an incomplete matrix.

## Pilot qualification decisions — 2026-09-04

- Corpus is fixed at 10 selections / 654,212,593 bytes: 7 supported unique videos, 2 deliberately invalid/unsupported codec inputs, 1 exact duplicate. Archive plus source/derivatives approximately 1.287 GB, below the 3 GiB cap. No operator videos accessed.
- Preserve both initial two-CPU pilots outside the measured matrix. Pilot 01 app completed in 49.676s, but the runner missed concatenated Vue status labels. Pilot 02 hit a real 7,000.9ms seek timeout (6 ready, 1 failed). A settled failure now ends the runner promptly and retains its report; no fixture substitution or app timeout change.
- Qualify **4 CPU / 4 GiB / 1 GiB shared memory**, before any measured rows, to avoid treating the earlier smoke-test CPU quota as representative native capacity. Chrome qualification passed (23.506s cold / 122ms warm) and Edge passed (25.889s / 141ms); this resource change is not an application speedup. Keep the full matrix at one fixed setting and report the failed two-CPU evidence separately.
- Warm imports retry the two invalid inputs: expect 7 cached videos, 2 skipped retries, 1 duplicate, 2 failed metadata observations and no new previews. Do not incorrectly require zero total metadata work.
- A very fast warm pipeline can have no complete in-workload 300ms input or 500ms RSS sample. Report unavailable/count 0/null, never zero latency/memory or a delayed synthetic workload. Caret-key handler/frame opportunities are not full interaction-to-paint latency; sampled summed process RSS is not isolated decoder memory. Those native acceptance gates remain open.
- The runner verifies served asset bytes against the local build, records runner/probe/corpus hashes and cgroup limits, validates schema/outcome/persistence/concurrency/terminal invariants, handles SIGINT/SIGTERM with owned-profile cleanup, and checks the combined two-browser matrix before a summary. Raw validator failures remain attached to their reports. No workers, merge or preprod release.

## Execution result — 2026-09-04 local

Tasks 1 and 2 are implemented and qualified. Task 3 collected and validated all 120 measured rows (five cold/warm pairs per browser/configuration), with 7 created videos / 63 preview frames per cold run and no pipeline failures. The [evidence record](../testing/video-processing-performance.md#public-reference-results--2026-09-04-local--2026-09-05-utc) contains exact commands/identities, medians/spread, proxy observations and excluded pilots/incomplete v1. The final v2 runner was frozen throughout collection; the app remained `00b7646` with workers disabled.

Awaited DOM seeking was the largest phase in both lanes in every cold report. No automatic concurrency change or worker speedup follows from that observation. Local final checks passed 342 unit/coverage tests, lint, app/Cypress types and the unchanged application build. Independent final evidence review and exact publication CI are recorded at handoff. The public-reference baseline begins the approved performance work but does not close personal-workload/native interaction/decoder-memory gates or authorize preprod release.
