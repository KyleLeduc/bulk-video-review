# Focus recovery and clip-quality smoke checkpoint

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
