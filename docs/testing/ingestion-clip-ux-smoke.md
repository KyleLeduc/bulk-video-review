# Motion previews, seek keyframes and focus recovery smoke plan

## Release checkpoint — failed-clip still fallback (v3)

Plan revision: `bvr-motion-keyframes-smoke-v3`, on `feat/video-benchmark-view`.
Use the exact target SHA in the new BVR-003 Notion Action/Test Run after deployment;
this document is a procedure, not proof of publication or acceptance.

The owner reports four consistently failed clip loops in the 20-video batch,
despite successful covers. Opening a player has not been established as the cause.
This increment adds resilience, not a claimed diagnosis: terminal clip extraction
failure tries nine DOM stills in the same motion job. Valid existing stills can be
reused. If both extractors fail, retain the cover. Seek work remains independent.
Successful clips stay preferred; 1.5 seconds / 20 FPS and 160 px seeks are unchanged.

| ID | Do | Expected result |
|---|---|---|
| FB-01 | Verify build identity, then reimport the same 20 originals, including the four failed files. | Successful videos still get clips. Clip failures try a nine-image slideshow; if available, the card reads **Still preview ready**, the orange clip-work border clears, and the toast counts still fallbacks separately from successful clips. Record which files use cover only; do not infer a root cause. |
| FB-02 | Hover a fallback card through a full cycle, then leave, scroll it offscreen, and open its main player. | Still images advance once per second and wrap. No preview controls or click interactions; inactive previews stop. The cover remains available if image display fails. Main-player seeking remains independent. |
| FB-03 | During **Generating still previews**, switch tabs, then separately focus another window while the app remains visible. Return and focus it. | Work pauses explicitly; no partial fallback is published. Missing work resumes, complete products remain, and cancellation is not treated as a failed extraction that starts more work. If timing cannot be hit, record Not run. |
| FB-04 | While still fallback is running, open pending A then B. | Active fallback finishes without cancellation. B's pending seeks are promoted at the next free slot; no simultaneous products for the same video or stranded queue. Repeat the v2 scheduling checks where practical. |
| FB-05 | Reload and reselect completed originals; preserve votes/pins. | Valid cached fallback returns without another failed clip attempt. Complete seeks return independently. Original clip reason remains visible in card diagnostics; no review metadata changes. |
| FB-06 | Enable reduced motion; try an available source that fails both preview paths. | Reduced motion uses the cover. Double failures also retain the cover and reach an explicit unavailable state, without blocking other files. Record missing double-failure coverage rather than treating it as Pass. |

Reuse v1 setup/privacy guidance and core checks, except SM-10's failed-motion
cover-only expectation is replaced by this fallback behavior. Keep all historical
attempts and owner observations below. Record actual SHA/browser/source location,
Pass / Fail / Blocked / Not run, and redacted diagnostics. Never clear the normal
review database or upload private videos as evidence. Native focus and the owner's
four files remain acceptance gates even after isolated automated smoke passes.

## Release checkpoint — product priority and progress (v2)

Plan revision: `bvr-motion-keyframes-smoke-v2`, on `feat/video-benchmark-view`.
The owner authorized publishing this refinement after local verification. Use
these additional checks only after the deployed identity matches the target SHA
recorded in the **new** v2 Notion Action/Test Run linked from BVR-003. This source
document alone is not deployment evidence. Keep v1 and attempt 1 below intact.
Reuse v1's setup/privacy guidance and core motion, seek,
focus and cache checks; these checks add scheduling/progress coverage.

The owner confirmed cycling clips, acceptable 160 px lab quality, and apparently
working functionality after importing 20 videos. The initial report of missing
clips was withdrawn. Poor progress visibility prompted this refinement; a stuck
queue was not established by that report. Actual earlier tested SHA/setup and
full per-check coverage remain unconfirmed.

One existing scheduler now dispatches complete products: newest-open pending seek
thumbnails, then other clips, then remaining background seeks. A priority change
does not interrupt active generation or saving. Closing/filtering/unmounting a
player releases priority; reopening promotes it again. Focus loss remains the
separate cancellation/pause boundary. No concurrency or output-quality tuning
is part of this change.

| ID | Do | Expected result |
|---|---|---|
| SP-01 | Import 20 representative originals in a disposable profile, with no main players open. Observe both progress rows. | The clips sweep precedes ordinary seek work. Rows show clip-ready and seek-ready video counts separately; active text names the actual product and generating/saving stage. Cards with complete clips lose the orange processing border even while seek work remains queued. |
| SP-02 | While a product is actively running, open pending video A and then pending video B. | Current work finishes normally. At the next free slot, B's pending seeks outrank A's pending seeks and other clips. A ready seek product is not generated again. With multiple slots, already-running products may finish in a different order; assess dispatch, not just completion order. |
| SP-03 | Repeat while a product is running: open A then B, close B before a slot frees. Repeat by closing and reopening A. Try opening via pin too. | Closing B releases its seek priority; reopening A makes A newest. Repeated rendering of an already-open player does not promote it. No duplicate work or lost clips; filtering/removal releases priority. |
| SP-04 | While clips are ready and seeks are pending, switch tabs and separately focus another window; return. | Paused is explicit. Complete products stay usable; only missing work resumes when visible AND focused. Opening a player does not bypass pause. Counts reach terminal ready/unavailable states without a silently pending video. |
| SP-05 | Open a video while its last product is saving; in a disposable profile also pause/reselect a source with complete cached products, then open and resume. | Saving finishes before its job settles. Fully hydrated inactive jobs retire without a stranded queue entry. No fabricated incomplete-product error appears between successful stages. |
| SP-06 | Import a second batch while earlier previews remain, and inspect a video from the earlier batch. | Counts are explicitly scoped to “This import”; active product text is labeled “Active work across all videos.” Per-card labels identify outstanding products. The toast remains a session report, not a new persistent global queue dashboard. |

For each check record Pass / Fail / Blocked / Not run, actual build/browser,
local/NAS source, observed order/stage and redacted evidence. Keep missing
coverage explicit; do not turn earlier quality feedback into new native/browser
acceptance. Real Chrome/Edge media/storage qualification and master promotion
remain separate gates.

Local implementation evidence (September 7, not a deployed artifact): lint,
type-check, 669 unit tests across 74 files, production build and whitespace check
passed. Independent read-only review has no remaining Important findings after
hydration/promise and cache-warning regressions were fixed. No native browser
test or physical focus-switch acceptance is claimed for this refinement.

## Previous owner checkpoint — 2026-09-07 (v1)

Plan revision: `bvr-motion-keyframes-smoke-v1`. Target build:
`e60b951391bb07e659ad2ae7051b25651954abb2`, branch `feat/video-benchmark-view`.
Live build identity was rechecked over trusted HTTPS on September 7. Publication
is not acceptance: this integration has not yet passed owner or new-product
native Chrome/Edge qualification. Master promotion remains pending.

- [Normal app](https://bvr.preprod.home.arpa/)
- [Extraction lab](https://bvr.preprod.home.arpa/benchmark/)
- [Build identity](https://bvr.preprod.home.arpa/benchmark/build-identity.json)
- [Authoritative integration criteria, Task 7](https://github.com/KyleLeduc/bulk-video-review/blob/e60b951391bb07e659ad2ae7051b25651954abb2/docs/plans/2026-09-06-motion-previews-keyframes.md#task-7-native-smoke-and-reviewed-release-readiness)

Notion handoff (published and read back September 7):

- [Editable owner test plan](https://app.notion.com/p/3d4ec4b831f881da88caf7c73352d0a6)
- [Attempt 1 — enter actual setup, results and observations here](https://app.notion.com/p/3d4ec4b831f881beb31dc66a264fd2a9)
- [BVR-003 feature progress](https://app.notion.com/p/3d4ec4b831f881089595e2bc63bbaa2f)
- [BVR-004 focus-recovery progress](https://app.notion.com/p/3d4ec4b831f8816d89c5c5c129b5303d)
- [Remaining Codex native qualification](https://app.notion.com/p/3d4ec4b831f881ff8e0cd144833e043c)

This Markdown refresh is an uncommitted documentation change, not a new deployed
build. The Notion Action and Run retain the prepared procedure revision; immutable
source links identify the approved integration criteria in the target commit.
Record feedback in the Test Run table/properties/page notes, not only comments:
the current integration cannot read Notion comments (403 insufficient permissions).

### Setup and recording

Allow approximately 25–35 minutes plus extraction time. Use Windows Chrome or
Edge, record the actual browser/version and local/NAS source location, then repeat
the core motion/seek/focus checks in the other browser when available. Use a new
Test Run for another browser, build or retest; do not overwrite earlier results.

Start with 3–5 representative files, including obvious motion, a short file and
a portrait file if available. Include a source over 25 minutes to exercise the
100-keyframe cap if available; record absent coverage. Use a disposable browser
profile for removal/cancel/cache tests. Do not clear your normal review database,
wipe personal data or upload private videos to Notion. Label evidence by file
ordinal; crop screenshots and review exported diagnostics for sensitive content.

Record actual Tested SHA, Tested at, Tester and Environment when you perform the
attempt. They are deliberately blank in a prepared Notion run. For each check,
record Pass / Fail / Blocked / Not run, Notes, Next step and Evidence. Overall Fail
means any observed failure, Partial means incomplete coverage without a known
failure, and Pass requires all required checks. Missing fixtures remain explicit.

### Owner checks

| ID | Do | Expected result |
|---|---|---|
| SM-01 | Open build identity, then the normal app. Record the actual revision and browser. | Revision matches the target above. Stop and record Blocked if it does not. |
| SM-02 | Import the representative batch with default settings. Scroll/filter, vote/pin and open a source while enrichment is pending. | Covers and review actions remain usable. Motion/keyframes arrive through the existing background queue without opt-in; foreground interaction remains responsive. |
| SM-03 | Hover a completed card long enough to cycle its clip array. Leave the card, filter it out, then open the main player. | Silent 1.5-second segments at a 20-FPS target cycle and wrap without objectionable flashes. No preview controls, click-to-pause, keyboard media focus or PiP affordance; card actions and main-player controls still work. Inactive/offscreen preview playback stops. |
| SM-04 | Hover/scrub the main-player trackbar at several positions, including near the end; inspect a short and portrait source. | Small, correctly proportioned thumbnails fit the tooltip and roughly match the nearest sampled source time. Sampling is every 15 seconds or 100 samples spread across the whole source, whichever yields fewer. Missing keyframes do not break time display or seeking. |
| SM-05 | During pending normal-app extraction, physically switch to another browser tab for 10–20 seconds, then return and focus the app. Repeat rapidly once. | Background previews pause and resume automatically without reload. No half-produced product is treated as complete or silently abandoned; successful products remain usable. This is a normal-app test, not a benchmark. |
| SM-06 | During pending normal-app extraction, focus another window while the app remains visible for 10–20 seconds. Return, then repeat while another import is queued. | Visible-but-unfocused also pauses background previews. Work resumes only when visible AND focused. No duplicate queue dispatch, lost review metadata or focus-induced corruption failure. Metadata/cover ingestion is not required to pause. |
| SM-07 | If clips have arrived while seek thumbnails are still pending, lose focus and return. Inspect Background previews diagnostics and the recovered gallery/trackbar. | Completed clips remain; only missing products retry. Each successful product finishes its expected array. For sources at least 30 seconds long, expect ten clips; keyframes use min(100, ceil(duration/15)). If the interruption window cannot be hit, record Not run rather than infer a pass. |
| SM-08 | In the disposable profile, remove a pending item during a pause and reselect it, then resume. | Removed work cannot reappear through a stale callback or overwrite the new attempt. Reselected source is usable; other items and their votes/pins are preserved. |
| SM-09 | After completion, reload and reselect the same originals. If an older still-only record is available, reselect its original too. | Valid cached products return without unnecessary regeneration; missing/legacy products upgrade when the original is available. Review metadata survives. Without source access, the cover remains usable; cache absence is not file corruption. Record whether legacy coverage was available. |
| SM-10 | Enable reduced motion and revisit a card. Also inspect a pending card; use a known unsupported-preview source only if available. | Reduced motion/pending/failed motion uses the cover, not the old still slideshow or a blank player. Seeking and review remain usable without previews. Report unsupported-format coverage separately; do not infer WebM qualification. |
| SM-11 | In the lab's Test runner tab, choose Motion + seek quality: 1.5 s · 20 FPS · 120 / 160 / 240 px. Select representative files, acknowledge the memory caveat and keep the page visible. After completion, hover/scrub the comparison rail. | Preset owns its settings independently of Manual config. One fixed production-motion extraction plus three keyframe widths run; samples appear only afterward. All width comparisons use video 1 and the same bounded tooltip size. Record preferred width, readability, portrait fit and clip transitions; a failed width must not silently substitute another source. |
| SM-12 | Switch Manual config / Test runner tabs after completion and check settings/results. Start another disposable lab run, Stop it, then separately interrupt a run by switching browser tabs. | Tabs preserve their own settings/results and pause hidden sample playback. Interrupted benchmark JSON is marked interrupted, retains available numeric evidence, and does not auto-resume as valid timing. This intentionally differs from the normal-app resumable queue. |

Exact policy reference: clip count is `min(10, max(1, floor(duration/3)))`, with
1.5-second windows clamped at the source end. Keyframe targets start at zero with
interval `max(15, duration/100)` and exclude the end. Initial keyframes are JPEG
quality 0.72 at up to 160 px width; clips use up to 320 px / 250 kbit/s. A source
with lower FPS cannot supply extra unique frames. These keyframes are sampled
seek images, not necessarily codec I-frames.

### Separate Codex qualification and deferred work

Task 7 still needs real Chrome/Edge decode/encode and timeline/count assertions,
controlled focus/partial-product recovery, IndexedDB transaction/rollback,
quota fallback, eviction, wipe/removal races, URL cleanup and legacy benchmark
isolation. Browser-profile wipe/quota injection is not an owner action against
valuable review data. Owner smoke and native checks must both be reviewed before
master promotion; no result is pre-marked Pass.

Post-master BVR-002 work stays deferred: matched local/NAS performance trials,
reader/prefetch experiments, sequential clips versus dispersed still seeks,
ingestion/backfill simplification and memory/responsiveness measurement. Richer
date/failure metadata and FFmpeg WASM remain separately scoped. Encoded-byte and
cache limits do not establish hard parser/decoder-memory bounds.

### Publication evidence, not test results

- September 6 release ledger: lint, types, 656 unit tests and production build
  passed before publication; these checks were not rerun by this documentation task.
- [Application CI](https://github.com/KyleLeduc/bulk-video-review/actions/runs/34066936186)
  and [preprod deployment](https://github.com/KyleLeduc/homelab-platform/actions/runs/34067126044)
  succeeded for the target build. September 7 HTTPS identity matches it.
- Earlier owner experiments selected 20 FPS and 1.5 seconds. They do not constitute
  acceptance of the integrated normal-app motion/keyframe path.

## Historical focus/FPS/duration checkpoint — superseded procedure

The remainder preserves earlier instructions and evidence. Use the current owner
checks above for `e60b951`; nine-still expectations and benchmark-only scope below
do not describe the newly integrated normal app.

Scope: `feat/video-benchmark-view`, following builds `5dc829f` and `f3d3f1f`. Further speed
benchmarking is deferred until master integration. This checkpoint does not
enable clips in normal ingestion/gallery or change the main video player.

## Normal app: focus recovery

1. Import representative files. While previews are pending, switch browser tabs.
   Separately repeat by focusing another window while this page stays visible.
2. Verify **Previews paused** is shown on return while still unfocused. Existing
   previews and imported metadata must remain usable; pending work must not turn
   into a file-corruption failure solely because of the pause.
3. Focus the visible app again. Pending previews resume automatically. Repeat
   focus changes quickly and once while another import is queued.
4. Open ingestion diagnostics after completion. Every successful normal preview
   job has nine frames; interrupted attempts count as aborted, not failed. Already
   complete files are not regenerated. Incomplete older sets can backfill on hover
   or reimport without losing votes, pins, playback URLs or valid old frames.
5. Try removal/reselection during a pause. No stale result may replace the new job.

The policy pauses **background preview extraction**, not all import metadata/cover
work. An interrupted file restarts its preview set; individual frames are not
checkpointed. Genuinely unrecoverable failures remain explicit.

## Benchmark: clip UX, not speed qualification

1. Open `/benchmark/`, select the extraction lab, choose one or two files with
   representative motion and acknowledge the parser/decoder memory limitation.
2. On **Test runner**, run the default **Clip duration: 0.5 / 1 / 1.5 / 2 s · 20 FPS**.
   The owner selected 20 FPS; compare duration before changing bitrate/resolution.
   The preset owns its settings; **Manual config** has no effect. Keep this
   benchmark visible throughout. Tabs lock until extraction stops or completes.
3. After completion, compare the duration variants. Each produces up to ten muted
   clips at 20 FPS / 320 px / 250 kbit/s, using matching source positions and counts.
   Short sources clamp clip ends. Only one video plays at once, advancing through
   the selected array and wrapping to its start. Older three-second presets remain
   available without changes to their recorded settings.
4. Check smoothness, detail, jumps between segments and blank/flashing transitions.
   There must be no native controls, click-to-pause/seek, keyboard media focus or
   picture-in-picture control. Use the external Pause/Resume and variant controls.
5. Check reduced-motion mode starts paused. Retry a playback failure with Resume;
   it must show a useful message rather than silently displaying a blank player.
6. Reselect files or start another run: old samples disappear and their object URLs
   are released. Stop keeps partial numeric JSON. Copy/download excludes file names,
   clip content and source timestamps. Manual still controls/results stay together
   on **Manual config**. Switching tabs preserves both panels' settings/results,
   pauses hidden clip playback, and resumes it on return unless explicitly paused
   or reduced motion is selected. Check Arrow/Home/End tab navigation too.

The supplied `f3d3f1f` report (`preview-extraction-custom-v1`, `hidden: true`, five
passed nine-frame jobs, sixth aborted) matches intentional **benchmark cancellation**.
Completed rows remain; unstarted files are not processed and the run will not resume.
Restart the benchmark while visible. This does not validate or invalidate normal
gallery focus recovery; use the normal-app steps above for that acceptance.

Compare the same file ordinal across variants; a failed file can cause a different
last-successful sample to be retained. FPS is a conversion target; a lower-FPS source
cannot supply additional unique frames. Fixed bitrate may trade per-frame detail
for smoother motion.

## Evidence and remaining acceptance

- Duration/tabs checkpoint (September 6): **574/574 unit tests passed** across
  63 files; lint, app/test type-check, changed Cypress-spec type-check, production
  build and whitespace checks passed. Native headless Chrome 152 and Edge 152 each
  passed both duration/tab and manual-extraction smoke specs. The duration check
  verified actual muxed playback lengths for all four variants, array cycling,
  hidden-panel pause/resume, settings retention and safe export/cancellation.
- New JUnit/download artifacts use `duration-tabs-20260906-chrome-*` and
  `duration-tabs-20260906-edge-*` under the same ignored primary-checkout artifact
  directory below. Independent duration/tab review found no Critical/Important
  issues. Manual owner acceptance of preferred duration remains open.
- Previous focus/FPS checkpoint: **540/540 passed** across 63 files. Lint, app/test type-check,
  changed Cypress-spec type-check, production build and whitespace checks passed.
- Native headless **Chrome 152.0.7977.64** and **Edge 152.0.4191.53**: five
  correctness checks per browser covering focus recovery (two cases), quality
  plan/playback, manual extraction and normal import/filter/review/restore.
  All passed. Four FPS variants each produced AVC clips for both fixtures;
  the short source yielded one clip and the longer source ten.
- Chrome's first hidden-case attempt reused IndexedDB previews and therefore did
  not enter extraction. A second test-isolation attempt created an unmigrated
  database; neither was an app-regression result. After fixing fixture isolation,
  both Chrome recovery cases passed. Edge passed all five in one run. Earlier
  failed artifacts are retained, not counted as passing evidence.
- Local JUnit/download artifacts are under the primary checkout's ignored
  `.codex-task-runs/20260905-152423-custom-mediabunny/`, using the
  `focus-clip-ux-20260906-chrome-*`, `chrome-r3-*` and `edge-*` prefixes.
  Both independent read-only reviews have no remaining Critical/Important findings.
- Native focus tests use controlled blur/visibility events in the Cypress iframe,
  with real DOM extraction and IndexedDB persistence. They are not a substitute for
  physical tab/window switches on the owner's Windows browser/NAS setup.
- Production clip scheduling, gallery integration, storage versioning/quotas and
  WebM browser qualification remain separate work. The encoded-output caps are not
  parser/decoder memory caps.
- Master merge and publication are separate verified operations; this document
  does not claim either has happened.
