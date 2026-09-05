import { CanvasSink, CustomSource, Input, MP4 } from 'mediabunny'
import {
  checkDimensions,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  MAX_READ_BYTES,
  safeFailure,
  validateExtraction,
  type PreparedExtraction,
} from './previewExtraction'

// Disposable, single-job worker. No production DI, persistence or fallback.
self.onmessage = async (
  event: MessageEvent<{ file: File; prepared: PreparedExtraction }>,
) => {
  let input: Input | undefined
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
    let readBytes = 0
    let readCalls = 0
    input = new Input({
      formats: [MP4],
      source: new CustomSource({
        getSize: () => file.size,
        maxCacheSize: 8 * 1024 * 1024,
        prefetchProfile: 'none',
        read: async (start, end) => {
          // Best-effort I/O guards, NOT pre-allocation or parser-memory limits.
          const bytes = end - start
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end > file.size ||
            bytes <= 0 ||
            bytes > 16 * 1024 * 1024 ||
            readBytes + bytes > MAX_READ_BYTES
          )
            throw new ExtractionError('read-limit')
          readBytes += bytes
          readCalls++
          return new Uint8Array(await file.slice(start, end).arrayBuffer())
        },
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
    for await (const wrapped of sink.canvasesAtTimestamps(prepared.targets)) {
      if (!wrapped || !(wrapped.canvas instanceof OffscreenCanvas))
        throw new ExtractionError('output-invalid')
      // Await encoding before the pool reuses this canvas.
      const blob = await wrapped.canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.72,
      })
      outputBytes += blob.size
      if (outputBytes > MAX_OUTPUT_BYTES)
        throw new ExtractionError('output-invalid')
      frames.push(blob)
    }
    const output = validateExtraction(
      {
        frames,
        width: prepared.width,
        height: prepared.height,
        readBytes,
        readCalls,
      },
      prepared,
    )
    self.postMessage({ ok: true, output })
  } catch (error) {
    self.postMessage({ ok: false, reason: safeFailure(error) })
  } finally {
    input?.dispose()
  }
}
