# Playback Controls and Ingestion Throughput Implementation Plan

**Goal:** Report actionable per-video ingestion throughput, extend controlled thumbnail concurrency tests, and restore reliable playback navigation with a bottom custom seek row.

**Architecture:** Keep run metrics in the existing Pinia ingestion-session snapshot, measuring foreground wall time and background active processing time separately. Keep thumbnail/video mode and the existing mute/loop/skip controls in `VideoCard`; keep media playback and seeking in `VideoEmbed`. The card toolbar remains visible while a video is open, the video surface toggles playback, and the bottom row owns only seek/time without native browser chrome.

**Tech Stack:** TypeScript, Vue 3, Pinia, Vitest, Vue Test Utils, SCSS.

---

### Task 1: Add run-scoped throughput metrics

**Files:**

- Modify: `src/presentation/stores/videosStore.ts`
- Test: `src/presentation/stores/videosStore.ingestionScheduler.spec.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Test: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

**Step 1: Write failing report tests**

Expect foreground average milliseconds per completed input and completed inputs per second. Expect preview average and throughput to use only active processing windows, excluding foreground interruption gaps.

**Step 2: Implement additive report fields**

Calculate full-precision report values and keep foreground elapsed time distinct from accumulated preview-active time.

**Step 3: Add clear UI labels**

Show the workers captured by the completed run, the setting that applies to the next import, and rounded rates for foreground and preview phases.

**Step 4: Verify focused tests**

Run:
`npx vitest run src/presentation/stores/videosStore.ingestionScheduler.spec.ts src/presentation/components/utils/DiagnosticsPanel.spec.ts --exclude '.worktrees/**'`

### Task 2: Specify the playback regression

**Files:**

- Modify: `src/presentation/components/VideoEmbed.previewRail.spec.ts`
- Modify: `src/presentation/components/VideoCard.spec.ts`

**Step 1: Add failing embed tests**

Expect the video before the bottom control row, no native `controls` attribute or duplicate transport buttons, accessible click/keyboard playback on the video surface, and a seek range whenever duration is valid even if preview frames are not ready. Keep hover images conditional on preview-frame availability.

**Step 2: Add a failing card navigation test**

Open playback through a real `Video` button, expect the card to enter its persistent video-open mode, then activate `Thumbs` and expect the image to return.

**Step 3: Verify RED**

Run:
`npx vitest run src/presentation/components/VideoEmbed.previewRail.spec.ts src/presentation/components/VideoCard.spec.ts --exclude '.worktrees/**'`

Expected: fail because the native controls remain, the range is above the video and frame-gated, and the mode toggle is hover-only non-button content.

### Task 3: Implement the custom bottom seek row

**Files:**

- Modify: `src/presentation/components/VideoEmbed.vue`

**Step 1: Move and decouple the seek range**

Render the media element before a bottom seek row. Show the range for any valid duration and show its preview tooltip only when frames exist. Anchor the tooltip upward from the bottom row.

**Step 2: Replace native playback controls**

Remove `controls`, make the video surface toggle playback by click, Enter, or Space, and add elapsed/duration text plus reactive `play`, `pause`, and `ended` event handling.

**Step 3: Verify focused embed behavior**

Run the preview-rail and base embed suites.

### Task 4: Make thumbnail navigation persistent during playback

**Files:**

- Modify: `src/presentation/components/VideoCard.vue`

**Step 1: Use explicit card mode state**

Add a video-open class from `state.showVideo`, use that state for mode-dependent controls, and render the mode toggle as an accessible button labelled by its action.

**Step 2: Keep the card toolbar above playback**

Force the toolbar visible while the video is open and give it a stacking level above the player controls.

**Step 3: Verify focused card behavior**

Run the card and preview-frame component suites.

### Task 5: Extend manual thumbnail concurrency

**Files:**

- Modify: `src/presentation/stores/videosStore.ts`
- Test: `src/presentation/stores/videosStore.previewScheduler.spec.ts`
- Modify: `src/presentation/components/utils/DiagnosticsPanel.vue`
- Test: `src/presentation/components/utils/DiagnosticsPanel.spec.ts`

**Step 1: Keep Auto conservative**

Leave automatic thumbnail concurrency at one worker.

**Step 2: Add controlled manual values**

Raise the manual thumbnail cap to four and expose 1, 2, 3, and 4 in diagnostics so identical test batches can measure scaling without changing the default.

### Task 6: Review and verify

**Step 1: Request independent code review**

Review metric denominators/timing windows, media state synchronization, keyboard access, videos without preview frames, stacking behavior, and object URL ownership.

**Step 2: Run full verification**

Run:

- `npm run lint`
- `npm run type-check`
- `npm run test:unit`
- `npm run build`
- `git diff --check`

**Step 3: Record browser acceptance checks**

Verify mouse and keyboard return-to-thumbnails behavior, play/pause, seeking with and without preview frames, and hover previews in representative gallery widths before the next preprod deployment.
