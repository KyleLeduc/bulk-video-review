# Mediabunny 1.55.7 qualification — 2026-09-05

## Outcome

**Stopped before installation at the approved read/index pre-allocation gate.** This is a narrow library-qualification result, not a failed throughput benchmark, a claim that ordinary videos will exhaust memory, or a general security advisory. Native Chrome/Edge extraction, frame correctness, worker cancellation, bundle cost and performance have not been tested. The existing DOM benchmark, normal app, package manifest/lock and preprod remain unchanged.

The owner approved proceeding with the proposed Mediabunny experiment. The [plan](../plans/2026-09-05-benchmark-webcodecs.md) requires rejection when parsed sample/index growth cannot be bounded before allocation, and disallows silently weakening limits or building a bespoke MP4 parser. The audit found precisely that gap. Downloading and inspecting a package archive did not install it into the shared worktree dependencies.

## Pinned artifact and scope

- Candidate: `mediabunny@1.55.7`, fetched using `npm pack --ignore-scripts`; no package lifecycle scripts executed.
- [Exact published archive](https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.7.tgz): 2,094,122 bytes; SHA-256 `845b2985487f4fe84cb2b0fdcd2199a4a51596687b300ad28f221f531aba80fc`.
- npm integrity: `sha512-Sb/vI8frRiDPbPUwl3hz0n69NSe9yt4Nydcv5yxi8Rdgk0BgnujEGjZqE+uCTehFbafcqIu6gDAok8ln98dcqg==`.
- Published source `src/isobmff/isobmff-demuxer.ts` SHA-256: `cd4e473cc7523766a0d38cdf9a36f85983a377491022a5a1c4b9787ba5d3a80b`.
- Executed ESM `dist/modules/src/isobmff/isobmff-demuxer.js` SHA-256: `436d33af697f5526db7e2e53b059db493c0d889220c89600091ccc5a737fc3b0`.
- Runtime: host Node `v24.19.0`, not a browser/WebCodecs runtime. Existing feature baseline `0537536432b3e5520e7999019ca410e9898935da`.
- License/manifest inspection: MPL-2.0; two declared type dependencies; no install lifecycle scripts. A package-only lookup at npm's public advisory bulk endpoint returned `{}` for this exact version. Transitive resolution/security clearance and release notice/source packaging remain unperformed.
- No owner files, filenames, selection IDs, paths, byte lists or content were used in the probe. Only tiny generated synthetic metadata containers were processed.

## Source finding

Line references below are to the **pinned archive source**, not a moving main branch:

1. `src/isobmff/isobmff-demuxer.ts:391–398`: the demuxer requests and retains the `moov` metadata box. Our proposed custom read callback can reject subsequent file I/O, but does not run before all library allocations (see the second finding below).
2. `:1831–1891`: `stts` timing entries and `ctts` composition-offset entries retain run-length counts read from 32-bit fields. The number of declared samples can be much larger than the number of encoded table entries.
3. `:645–675`: when composition offsets exist, `getSampleTableForTrack` expands every declared timing sample into a presentation-timestamp object, sorts them, then allocates a second sample-to-presentation index. There is no configured admission count/budget before the expansion loop.
4. `:2974–2980` and `:3147–3153`: public packet lookup reaches this expansion, including metadata-only lookup. Track metadata-duration lookup also reaches it via `getFirstPacket` (`:2924–2936`); it is not a safe preflight around the allocation.
5. `src/input.ts:58–79`, `src/input-format.ts:772–805` and `src/source.ts:1379–1416`: the inspected public input/MP4/custom-source options provide formats, source/cache/read policy and decryption configuration, but no pre-expansion index limit or admission callback.

Consequently, limiting read ranges and source-cache bytes does **not** bound this derived index. Once metadata is present, expansion can run synchronously without another source callback. A deadline/worker termination is a useful retirement mechanism but is not proof of rejection before memory allocation. Reading private fields after the expansion would be too late; runtime patching those internals or adding a separate pre-parser would change the approved approach.

This does not establish that every Mediabunny operation is unbounded, nor that MP4Box.js avoids this issue. It establishes that the inspected path cannot meet BVR's current pre-allocation contract using the proposed public API.

### Second finding: the read callback is too late for buffer admission

`src/reader.ts:29–49` passes the requested range to the source. `CustomSource._read` calls its read orchestrator (`src/source.ts:1473–1501`), which creates `new Uint8Array(innerEnd - innerStart)` for a cache miss (`:2031`) and retains it in a pending slice (`:2115–2121`). Only then does the read worker invoke the user-supplied `_options.read` callback (`:1505–1512`). Thus the planned callback guard is before `File.slice()` and I/O, **not before the library's requested-range allocation**. The cache-size setting is not an admission limit for this buffer either. Both read-buffer admission and derived-index admission need resolution; fixing only the sample-count loop would not qualify the current design.

## Small runtime reproduction

The [offline probe](../../scripts/qualifyMediabunnyIndex.mjs) constructs fixed 16×16 AVC-labelled metadata containers with either 1 or 4,096 declared samples, a single run-length timing entry and optional composition-offset entry. It never decodes the synthetic payload, which is **not valid H.264**. This is an index-behavior witness, not a playable-video, B-frame-correctness or performance fixture.

It uses real `File.slice()` reads through the unmodified package's `CustomSource` (8 MiB cache, no prefetch), rejects individual reads above 1 MiB and cumulative reads above 128 MiB, and throws on top-level File reads. It obtains the track and calls the public `EncodedPacketSink.getPacket(..., { metadataOnly: true })`. Read-only inspection of pinned internal arrays then measures their entry counts; this is deliberately not an integration API. `Input.dispose()` runs in `finally` and its source disposal callback is asserted.

| Synthetic case | File bytes | Bytes read / largest read | Timing / composition entries | Presentation objects / index slots | Extra bytes read during packet lookup |
|---|---:|---:|---:|---:|---:|
| 1 sample, offsets present | 4,571 | 467 / 427 | 1 / 1 | 1 / 1 | 0 |
| 4,096 samples, offsets present | 4,571 | 467 / 427 | 1 / 1 | 4,096 / 4,096 | 0 |
| 4,096 samples, no offsets | 4,547 | 443 / 403 | 1 / 0 | 0 / 0 | 0 |

All three cases pass their assertions and source disposal is observed in each case. Only tiny counts are executed: no huge-count/OOM probe is necessary or authorized. These are object/slot counts, **not measured heap bytes or a browser process-memory bound**. The exact same read budget can admit very different index growth, confirming the source review independently of decoding.

The same standalone probe separately observes `Uint8Array` construction through a pass-through constructor proxy, restored in `finally`, while deliberately rejecting reads above **64 bytes**. It observed a **435-byte library allocation before the callback rejected a 427-byte read**. The source disposal callback was observed. This tiny diagnostic threshold demonstrates ordering; it does not change the proposed 1 MiB application limit, measure an OOM, modify the library or provide a production workaround.

To reproduce without installing or changing BVR dependencies, from the feature checkout:

```sh
qualification_dir=$(mktemp -d /tmp/bvr-mediabunny-audit.XXXXXX)
npm pack mediabunny@1.55.7 --ignore-scripts --pack-destination "$qualification_dir"
sha256sum "$qualification_dir/mediabunny-1.55.7.tgz"
tar -tvzf "$qualification_dir/mediabunny-1.55.7.tgz"
```

Before extracting, confirm the archive hash equals the value above and every archive entry is beneath `package/`, without traversal or links. Then:

```sh
tar -xzf "$qualification_dir/mediabunny-1.55.7.tgz" -C "$qualification_dir" --no-same-owner
node --max-old-space-size=128 scripts/qualifyMediabunnyIndex.mjs "$qualification_dir/package"
```

Network/package fetches require the repository's normal network approval. The script checks only manifest name/version before importing executable package code; it assumes a **fresh extraction of the operator-verified archive**, not an arbitrary or modified same-version directory. Its JSON is not standalone artifact-identity evidence: retain the verified archive/hash and command alongside the output. Keep the temporary archive/source until review; do not run a broad cleanup command. The Node old-space flag is an extra diagnostic constraint, not a hard total-process memory cap. The probe has no arbitrary-media input option and is not imported by the app or `/benchmark`.

## Verification and next decision

The unchanged application baseline passed **419/419 tests in 50 files**. Its initial sandbox run failed local HTTP fixture binding; rerunning with localhost binding permitted passed without any source change. The synthetic probe also passed against the exact extracted package. Full-browser qualification remains unattempted because the earlier gate failed.

Final checkpoint checks: `npm run lint`, `npm run type-check`, `npm run test:unit` (**419/419**) and `npm run build` passed, as did the standalone probe and `git diff --check`. Independent read-only review confirmed both source findings; the main agent verified them and reproduced the small cases. Root AGENTS/devcontainer edits and the shared `node_modules` symlink were preserved. No claim of full worker implementation or native browser acceptance follows from these checks.

Before continuing toward a selectable candidate, choose explicitly between obtaining reviewed pre-allocation read-buffer and index admission limits for Mediabunny (upstream or an approved covered-source modification), or revising the experiment to a narrower controlled-input scope with clearly weaker guarantees. Neither option is implemented here. Merely counting frames after the current API parses them is not the missing limit.

MP4Box.js + WebCodecs remains the most relevant alternative, subject to the same resource audit and approval before installation. Dependency-free DOM extraction tuning remains a control. FFmpeg/WASM is a separate lower-priority option for a demonstrated codec/functional gap, not a transparent faster demuxer replacement. Do not request another unchanged owner DOM suite or compare this metadata probe with the 9.45-second full-pipeline baseline.
