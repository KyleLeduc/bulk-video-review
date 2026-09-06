import { CanvasSink, CustomSource, Input, MP4 } from 'mediabunny'
import {
  createBenchmarkFileReader,
  type BenchmarkReaderMode,
} from './benchmarkFileReader'
import {
  checkDimensions,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  safeFailure,
  validateExtraction,
  emptyMetrics,
  type ExtractionOutput,
  type PreparedExtraction,
} from './previewExtraction'

// Disposable, single-job worker. No production DI, persistence or fallback.
self.onmessage = async (
  event: MessageEvent<{
    file: File
    prepared: PreparedExtraction
    readerMode?: BenchmarkReaderMode
  }>,
) => {
  let input: Input | undefined
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
    const { file, prepared } = event.data
    if (
      !(file instanceof File) ||
      prepared.targets.length !== 9 ||
      !prepared.targets.every(
        (n, i, list) =>
          Number.isFinite(n) && n >= 0 && (i === 0 || n >= list[i - 1]),
      )
    )
      throw new ExtractionError('invalid-metadata')
    checkDimensions(prepared.width, prepared.height)
    const reader = createBenchmarkFileReader(
      file,
      event.data.readerMode ?? 'direct',
      metrics,
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
    const sink = new CanvasSink(track, {
      width: prepared.width,
      height: prepared.height,
      fit: 'contain',
      poolSize: 1,
    })
    const frames: Blob[] = []
    let outputBytes = 0
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
        // Await encoding before the pool reuses this canvas.
        const encodeStarted = performance.now()
        const blob = await wrapped.canvas.convertToBlob({
          type: 'image/jpeg',
          quality: 0.72,
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
    const output = validateExtraction(
      {
        metrics,
        frames,
        width: prepared.width,
        height: prepared.height,
        readBytes: reader.readBytes,
        readCalls: reader.readCalls,
      },
      prepared,
    )
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
  }
  self.postMessage(reply!)
}
