# Approximate browsing-preview timing

## Approved intent and evidence

The owner prioritizes complete, useful motion and seek arrays over frame-accurate sampling positions. Keep the selected production format: up to ten silent 1.5-second, 20-FPS, 320-pixel clips, and the existing 15-second/max-100, 160-pixel seek policy. This is not a source-media edit or a player timeline change.

On feature build `71d34609605f86465ac0b1eeabb2e9355a425171`, the supplied nine-file NAS report fails all 36 motion/seek jobs before decoding. The shared guard requires coverage of the entire player duration within one track tick. Seven files have tail differences of 33.873–104.577333 ms; two have leading gaps of 33/46 ms. The exact nine metadata tuples reproduce the rejection locally. One track tick measures timestamp precision, not frame length. The seven tail-only files do not even request media outside the reported track interval.

## Options

1. Increase a global duration tolerance. Small, but arbitrary; it still does not turn a request before the first frame into a decodable request.
2. **Bound individual samples to the available video interval (selected).** Preserve normal targets, move boundary requests to available content, and retain meaningful validation.
3. Replace all sampling with a rescaled track-only timeline. Produces a full overview but moves every sample, even when the original targets were already usable; unnecessary for these failures.

## Design

`playerTimeline.ts` continues to own pinned-adapter timing compatibility and unsupported-edit warning handling. Its check returns a finite usable interval (intersection of the track and nonnegative player timeline), timestamp precision, and small timestamp/window bounding functions. Reject nonfinite/empty/inverted intervals and unsupported edit lists. Do not reject a valid interval merely because its boundaries differ from the player's.

For seek images, clamp the extraction target between the usable start and just before the exclusive end. Compare returned frame ordering and future timestamps against that extraction target, not the nominal seek slot. Keep full-count and nonempty JPEG validation. Stored seek timestamps remain nominal player-time browsing slots, not claims of frame-accurate decoded timestamps.

For clips, keep each nominal overview slot, and move the actual trim into the usable interval while preserving its requested length whenever possible. If the entire usable interval is shorter, trim to that interval. Report the actual trim length and the nominal slot start. Domain/client validators continue to require the exact slot sequence/count and valid bounded output, but allow positive clip lengths no greater than the slot's requested length. These are approximate browsing previews; decoded frame rounding remains codec-dependent.

No new dependencies, queue changes, concurrency tuning, read-budget increase, source repair, database migration, or cache wipe. Existing valid products remain valid. Existing complete still fallbacks remain usable and are not silently invalidated or retried forever; a safe explicit motion-upgrade retry is separate follow-up work. The benchmark always makes fresh attempts and is the first owner regression checkpoint. Original files/votes remain untouched.

## Verification and release

Browser qualification exposed one separate rendering defect within this slice:
batched visibility notifications could leave successfully generated previews
hidden because `MotionPreview` used the first entry, not the latest state.
Use the last entry for its single observed container and cover activation,
deactivation and URL cleanup for both clips and stills. This preserves existing
focus/reduced-motion/offscreen policy and adds no scheduling mechanism.

Red/green unit regressions cover all nine exact reported tuples, leading and trailing clamps, short intervals, invalid/disjoint timing, unsupported edit warnings, output count and timestamp validation, progress and cleanup. Worker tests verify actual trim/seek inputs separately from nominal output slots. A real encoded boundary fixture exercises both workers in the browser and checks nonblank output and complete counts; it is not proof of all original NAS files.

Run targeted tests, full unit tests, lint, types, build and independent read-only review serially within the shared environment constraints. Publish the feature commit, wait for trusted exact-SHA CI, deploy its immutable image to existing preprod, verify HTTPS/identity/readiness and automated browser smoke. Keep historical owner Fail separate from automated Pass; owner retests the same nine originals. The earlier file-9 read-limit may remain and is not hidden by this change. No master integration or production promotion.
