# Automatic thumbnail concurrency: two workers

> Approved by the owner on 2026-09-07. Execute with test-driven development and verification before completion.

## Scope and rationale

Change only the automatic thumbnail queue limit from one to two. Initial ingestion remains Auto (2); manual thumbnail limits 1–4 remain supported. Keep current product priorities, per-video exclusion, cancellation, focus pause/resume, and persistence unchanged.

The owner's seven-video NAS trials completed all 14 preview attempts and 663 reported units without failures: background elapsed time was 186.260 s with one worker, 82.708 s with two, and 101.826 s with three. Two is the fastest tested setting, not a proven universal optimum: each configuration has one reported run, and source identity, build identity, cache conditions, and UI responsiveness were not independently established.

## Implementation and checks

1. Update the default scheduler regression to queue three videos and prove Auto (2) starts exactly two, then starts the third only when a slot opens. Update Diagnostics expectations to Auto (2). Run these tests red before changing production code.
2. Change `AUTO_THUMBNAIL_CONCURRENCY` in `src/presentation/stores/videosStore.ts` to 2. Keep intentionally serial tests explicit with a manual limit of one, if necessary; preserve manual override and session-snapshot coverage.
3. Run targeted scheduler, motion-preview, ingestion, and Diagnostics tests; lint, type-check, unit suite, build, and relevant browser checks. Review the small diff independently before committing.
4. Follow the feature worktree's existing release contract: commit scoped files, push the feature, require trusted CI for that exact SHA, deploy its immutable image to existing preprod, and verify identity/readiness/HTTPS and automated smoke. Preserve rollback and operator data.
5. Refresh Notion acceptance records and provide a focused owner retest for default two-worker behavior. Do not integrate master or close out the worktree without acceptance and separate authorization.

## Closeout gates

- Default two-worker queue completes clips/fallbacks and seek thumbnails without stranded jobs; opening a video remains responsive and promotes its seek work.
- Physical tab hiding and window focus loss pause and resume processing without partial arrays.
- Original representative batch, including previously failing clip sources, produces a clip loop or usable static fallback and independently settles seek work.
- Reload/reselection retains cached previews and user state; cancellation/removal and storage failures settle safely.
- Native output/UX checks in `docs/testing/ingestion-clip-ux-smoke.md` and Task 7 of `2026-09-06-motion-previews-keyframes.md` are evidenced or explicitly retained as gates. Synthetic browser checks do not replace owner/NAS acceptance.
- Record ingestion optimization exploration as follow-up, not a prerequisite for changing this default. Preserve existing unstaged backlog work.
