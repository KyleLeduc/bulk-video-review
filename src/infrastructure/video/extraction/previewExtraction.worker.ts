import { CanvasSink, CustomSource, Input, MP4 } from 'mediabunny'
import type { VideoPreviewDiagnostic } from '@app/ports/IVideoPreviewGenerator'
import { safeDiagnostics } from './workerDiagnostics'
import {
  prepareKeyframes,
  validateKeyframeOutput,
  type KeyframeRequest,
} from './keyframeExtraction'
import { createPlayerTimelineGuard } from './playerTimeline'
import { KEYFRAME_QUALITY } from '../../../domain/services/videoPreviewPolicy'
import { createFileReader, type FileReaderMode } from './fileReader'
import {
  checkDimensions,
  checkPreviewCount,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  safeFailure,
  validateExtraction,
  emptyMetrics,
  type ExtractionOutput,
  type PreparedExtraction,
} from './previewExtraction'

// Disposable, single-job worker. No DI, persistence or fallback.
self.onmessage = async (
  event: MessageEvent<
    { file: File; progress?: boolean } & (
      | KeyframeRequest
      | {
          file: File
          prepared: PreparedExtraction
          readerMode?: FileReaderMode
        }
    )
  >,
) => {
  let input: Input | undefined
  let timeline: ReturnType<typeof createPlayerTimelineGuard> | undefined
  const started = performance.now()
  const metrics = emptyMetrics()
  const diagnostics: VideoPreviewDiagnostic = { stage: 'setup' }
  let reader: ReturnType<typeof createFileReader> | undefined
  metrics.readMs = metrics.readMaxMs = 0
  let reply:
    | { ok: true; output: ExtractionOutput }
    | { ok: false; reason: string; diagnostics?: VideoPreviewDiagnostic }
  try {
    if (
      typeof VideoDecoder === 'undefined' ||
      typeof OffscreenCanvas === 'undefined'
    )
      throw new ExtractionError('unsupported')
    const { file } = event.data
    const keyframes = 'kind' in event.data ? event.data : undefined
    let prepared = 'prepared' in event.data ? event.data.prepared : undefined
    if (keyframes) {
      // Validate before opening the input; source dimensions are checked again below.
      prepareKeyframes(keyframes.duration, 1, 1, keyframes.maxWidth)
      timeline = createPlayerTimelineGuard()
    }
    if (
      !(file instanceof File) ||
      (!keyframes &&
        (!Array.isArray(prepared?.targets) ||
          !prepared!.targets.every(
            (n, i, list) =>
              Number.isFinite(n) && n >= 0 && (i === 0 || n >= list[i - 1]),
          )))
    )
      throw new ExtractionError('invalid-metadata')
    const count = keyframes ? 100 : prepared!.targets.length
    checkPreviewCount(count)
    if (!keyframes) {
      checkDimensions(prepared!.width, prepared!.height)
    }
    reader = createFileReader(
      file,
      keyframes
        ? 'buffered-1mib'
        : ('readerMode' in event.data ? event.data.readerMode : undefined) ??
            'direct',
      metrics,
      count,
    )
    diagnostics.stage = 'metadata'
    input = new Input({
      formats: [MP4],
      source: new CustomSource({
        getSize: () => file.size,
        maxCacheSize: 8 * 1024 * 1024,
        prefetchProfile: 'none',
        read: reader.read,
      }),
    })
    const track = await input.getPrimaryVideoTrack()
    diagnostics.codec = (await track?.getCodec()) ?? undefined
    if (!track || (await track.getCodec()) !== 'avc')
      throw new ExtractionError('unsupported')
    checkDimensions(await track.getCodedWidth(), await track.getCodedHeight())
    checkDimensions(
      await track.getDisplayWidth(),
      await track.getDisplayHeight(),
    )
    if (!(await track.canDecode())) throw new ExtractionError('unsupported')
    let tolerance = 0
    let targets = prepared?.targets
    if (keyframes) {
      diagnostics.stage = 'timeline'
      if (keyframes.kind !== 'keyframes')
        throw new ExtractionError('invalid-metadata')
      const range = await timeline!.check(track, keyframes.duration)
      tolerance = range.tolerance
      prepared = prepareKeyframes(
        keyframes.duration,
        await track.getDisplayWidth(),
        await track.getDisplayHeight(),
        keyframes.maxWidth,
      )
      targets = prepared.targets.map(range.clampTimestamp)
    }
    if (!prepared || !targets) throw new ExtractionError('invalid-metadata')
    const sink = new CanvasSink(track, {
      width: prepared.width,
      height: prepared.height,
      fit: 'contain',
      poolSize: 1,
    })
    const frames: Blob[] = []
    let outputBytes = 0
    let previousTimestamp = -Infinity
    metrics.setupMs = performance.now() - started
    const iterator = sink.canvasesAtTimestamps(targets)
    try {
      for (;;) {
        diagnostics.stage = 'decode'
        const extractionStarted = performance.now()
        const next = await iterator.next()
        metrics.extractionMs += performance.now() - extractionStarted
        if (next.done) break
        const wrapped = next.value
        if (!wrapped || !(wrapped.canvas instanceof OffscreenCanvas))
          throw new ExtractionError('output-invalid')
        if (keyframes) {
          timeline!.assertSupported()
          if (
            !Number.isFinite(wrapped.timestamp) ||
            wrapped.timestamp < previousTimestamp ||
            wrapped.timestamp > targets[frames.length] + tolerance
          )
            throw new ExtractionError('unsupported-timeline')
          previousTimestamp = wrapped.timestamp
        }
        // Await encoding before the pool reuses this canvas.
        const encodeStarted = performance.now()
        diagnostics.stage = 'encode'
        const blob = await wrapped.canvas.convertToBlob({
          type: 'image/jpeg',
          quality: KEYFRAME_QUALITY,
        })
        metrics.encodeMs += performance.now() - encodeStarted
        outputBytes += blob.size
        if (outputBytes > MAX_OUTPUT_BYTES)
          throw new ExtractionError('output-invalid')
        frames.push(blob)
        if (event.data.progress)
          self.postMessage({
            type: 'progress',
            completed: frames.length,
            total: prepared.targets.length,
            diagnostics: safeDiagnostics({
              ...diagnostics,
              ...timeline?.diagnostics(),
              readBytes: reader.readBytes,
              readCalls: reader.readCalls,
              elapsedMs: performance.now() - started,
              outputBytes,
            }),
          })
      }
    } finally {
      await iterator.return()
    }
    timeline?.assertSupported()
    const rawOutput = {
      metrics,
      frames,
      width: prepared.width,
      height: prepared.height,
      readBytes: reader.readBytes,
      readCalls: reader.readCalls,
    }
    const output = keyframes
      ? validateKeyframeOutput(
          rawOutput,
          keyframes.duration,
          keyframes.maxWidth,
        )
      : validateExtraction(rawOutput, prepared)
    reply = { ok: true, output }
  } catch (error) {
    reply = {
      ok: false,
      reason: safeFailure(error),
      diagnostics: safeDiagnostics({
        ...diagnostics,
        ...timeline?.diagnostics(),
        errorName: (error as Error)?.name,
        readBytes: reader?.readBytes,
        readCalls: reader?.readCalls,
        elapsedMs: performance.now() - started,
      }),
    }
  } finally {
    const cleanupStarted = performance.now()
    try {
      input?.dispose()
    } catch (error) {
      const prior = reply! && !reply.ok ? reply : undefined
      reply = {
        ok: false,
        reason: prior?.reason ?? 'extraction-failed',
        diagnostics: safeDiagnostics({
          ...diagnostics,
          ...(prior?.diagnostics ?? {
            stage: 'cleanup',
            errorName: (error as Error)?.name,
          }),
          cleanupFailed: true,
        }),
      }
    }
    metrics.cleanupMs = performance.now() - cleanupStarted
    metrics.totalMs = performance.now() - started
    timeline?.dispose()
  }
  self.postMessage(reply!)
}
