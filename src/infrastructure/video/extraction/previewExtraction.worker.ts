import { CanvasSink, CustomSource, Input, MP4 } from 'mediabunny'
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
    { file: File } & (
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
  metrics.readMs = metrics.readMaxMs = 0
  let reply:
    | { ok: true; output: ExtractionOutput }
    | { ok: false; reason: string }
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
    const reader = createFileReader(
      file,
      keyframes
        ? 'buffered-1mib'
        : ('readerMode' in event.data ? event.data.readerMode : undefined) ??
            'direct',
      metrics,
      count,
    )
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
    if (!track || (await track.getCodec()) !== 'avc')
      throw new ExtractionError('unsupported')
    checkDimensions(await track.getCodedWidth(), await track.getCodedHeight())
    checkDimensions(
      await track.getDisplayWidth(),
      await track.getDisplayHeight(),
    )
    if (!(await track.canDecode())) throw new ExtractionError('unsupported')
    let tolerance = 0
    if (keyframes) {
      if (keyframes.kind !== 'keyframes')
        throw new ExtractionError('invalid-metadata')
      tolerance = await timeline!.check(track, keyframes.duration)
      prepared = prepareKeyframes(
        keyframes.duration,
        await track.getDisplayWidth(),
        await track.getDisplayHeight(),
        keyframes.maxWidth,
      )
    }
    if (!prepared) throw new ExtractionError('invalid-metadata')
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
    const iterator = sink.canvasesAtTimestamps(prepared.targets)
    try {
      for (;;) {
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
            wrapped.timestamp > prepared.targets[frames.length] + tolerance
          )
            throw new ExtractionError('unsupported-timeline')
          previousTimestamp = wrapped.timestamp
        }
        // Await encoding before the pool reuses this canvas.
        const encodeStarted = performance.now()
        const blob = await wrapped.canvas.convertToBlob({
          type: 'image/jpeg',
          quality: KEYFRAME_QUALITY,
        })
        metrics.encodeMs += performance.now() - encodeStarted
        outputBytes += blob.size
        if (outputBytes > MAX_OUTPUT_BYTES)
          throw new ExtractionError('output-invalid')
        frames.push(blob)
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
    reply = { ok: false, reason: safeFailure(error) }
  } finally {
    const cleanupStarted = performance.now()
    try {
      input?.dispose()
    } catch {
      reply = { ok: false, reason: 'extraction-failed' }
    }
    metrics.cleanupMs = performance.now() - cleanupStarted
    metrics.totalMs = performance.now() - started
    timeline?.dispose()
  }
  self.postMessage(reply!)
}
