# Primary Ingestion Concurrency and Observability Design

## Objective

Make the user-visible intake path faster by processing independent videos with
bounded concurrency, while keeping background preview generation subordinate to
foreground ingestion. Make each run observable and exportable so browser
performance comparisons can be reported without exposing filenames or media.

## Decision

Use a staged Promise worker pool inside the ingestion use case. Automatic
foreground concurrency is two jobs, with a diagnostics override from one to
four. Background preview generation remains automatic one and maximum two.
Both settings are snapshotted when an import batch is queued so a later control
change cannot rewrite the configuration recorded for that run.

These are bounded browser jobs, not Web Workers. Each foreground job may own a
video decoder, a bounded cover canvas, and IndexedDB transactions. Starting at
two provides useful overlap without making four decoders the default memory
budget. Four remains available for an explicit benchmark.

## Alternatives considered

- `Promise.all` over every file was rejected because the selected batch size
  would become the decoder and memory budget.
- Store-level parallel orchestration was rejected because classification,
  retry priority, duplicate ownership, and progress semantics belong to the
  ingestion use case.
- Web Workers, FFmpeg.wasm, and WebCodecs were deferred. DOM video decoding and
  canvas capture cannot simply be moved into a worker, and the current goal is
  bounded intake rather than transcoding.

## Foreground pipeline

The use case runs five observable phases:

1. `identifying`: generate stable IDs with bounded concurrency.
2. Deduplicate identified items in original selection order. The first item for
   an ID owns decoding, persistence, and session registration.
3. `classifying`: look up aggregates, hydrate optional preview data, and check
   prior failure state with bounded concurrency.
4. `ingesting-fresh`: decode and persist unseen items with bounded concurrency.
5. `ingesting-retries`: after every fresh item settles, process previously
   failed items with the same bound, then emit `complete`.

Tasks start in input order and events may arrive in completion order within a
phase. Cached videos are emitted before fresh decoding begins. Fresh work fully
drains before retry work begins. Import batches remain FIFO; a new batch does
not abort an active foreground batch.

Background preview jobs are still aborted and allowed to unwind before the next
foreground batch starts. They resume only after the foreground queue drains.

## Duplicate and persistence safety

The current ID hashes only `file.name + file.size`. Two selected files can
therefore share an ID. Identification completes before classification so the
earliest selected item deterministically owns that ID. Later duplicates count
as completed duplicates but are never decoded, persisted, emitted, or
registered.

IndexedDB supports concurrent transactions for distinct IDs. No global
repository lock is added. Aggregate persistence still uses separate metadata
and video transactions; making that pair atomic is a separate hardening task.

## Progress contract

`VideoIngestionProgress` retains its existing counters and adds:

- phase and effective concurrency;
- active and pending item counts;
- phase completed/total counts;
- peak active and pending counts;
- accepted input bytes;
- classification, processing, and total elapsed milliseconds;
- separate skipped and duplicate counts.

`failedCount` represents actual failures. `skippedCount` represents invalid or
unplayable files, and `duplicateCount` represents repeated IDs. The final
invariant is `completedCount === total`.

An initial progress event is emitted before awaiting work so the interface
immediately displays the phase and job budget.

## Run report

The store retains the latest displayed session and produces a versioned,
JSON-serializable report. It contains no `File`, `Blob`, object URL, filename,
or error stack.

The report contains:

- selected, accepted, unsupported, and accepted-byte input totals;
- queued, foreground, and end-to-end timestamps;
- foreground concurrency mode/request/effective/peak;
- phase, queue, result, and aggregate timing values;
- run-scoped background preview concurrency, queue peaks, frames, bytes,
  dimensions, elapsed timings, and errors;
- browser user agent and reported hardware concurrency.

Preview aggregation uses only the session's tracked video IDs, never the global
preview queue. Aggregate classification versus processing time is sufficient
for the first benchmark; per-file metrics are intentionally omitted to reduce
privacy exposure and report noise.

## Presentation

Diagnostics shows separate `Foreground ingestion` and `Background previews`
sections. Foreground choices are Auto (2) and 1-4. Preview choices are Auto (1),
1, and 2. Labels say jobs rather than workers because no worker thread is
created.

The panel binds to the displayed/latest session so results remain visible after
foreground ingestion ends. A copy button uses the Clipboard API when available.
A read-only JSON field is always available because private HTTP origins may not
expose the secure Clipboard API.

The status toast names the active phase, shows active/pending/effective
foreground jobs, and explicitly switches to background preview progress after
foreground completion.

## Error and lifecycle behavior

One item failure becomes a result and does not reject or shrink the pool.
Preview hydration remains best-effort. No superficial foreground cancellation
is added: correct cancellation would need to propagate through ID generation,
metadata extraction, video loading/seeking/encoding, repository writes, and
pool drainage.

The session records foreground completion separately from full pipeline
completion. A session reaches complete when all its preview jobs are ready or
failed. Aborted-and-requeued preview work remains pending.

## Verification

Tests cover bounds one, two, and four; slot refill; completion-order emission;
fresh-before-retry barriers; failure isolation; deterministic duplicate
ownership; monotonic progress; concurrency snapshots; run-scoped preview
aggregation; report stability; clipboard fallback; and phase labels.

Lint, type-check, the full unit suite, and a production build run before
handoff. A real-browser batch benchmark remains required to measure decoder
memory, long tasks, and the practical difference between one, two, and four
foreground jobs.
