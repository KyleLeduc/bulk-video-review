import {
  canEncodeVideo,
  Conversion,
  CustomSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
} from 'mediabunny'
import { createFileReader } from './fileReader'
import {
  motionClipWindows,
  MOTION_FRAME_RATE,
  MOTION_SECONDS,
} from '../../../domain/services/videoPreviewPolicy'
import { createPlayerTimelineGuard } from './playerTimeline'
import type { MotionRequest } from './clipWorkerClient'
import {
  boundedClipBuffer,
  clipDimensions,
  clipWindows,
  validateClipFrameRate,
  validateClipSeconds,
  MAX_CLIP_BYTES,
  validateClipOutput,
  type ClipOutput,
} from './clipExtraction'
import {
  checkDimensions,
  emptyMetrics,
  ExtractionError,
  MAX_OUTPUT_BYTES,
  safeFailure,
} from './previewExtraction'

// One file per disposable worker; the client terminates it on cancellation/deadline.
self.onmessage = async (
  event: MessageEvent<
    {
      file: File
      frameRate: unknown
      clipSeconds: unknown
    } & Partial<MotionRequest>
  >,
) => {
  const started = performance.now()
  let input: Input | undefined
  let conversion: Conversion | undefined
  let timeline: ReturnType<typeof createPlayerTimelineGuard> | undefined
  let reply: { ok: true; output: ClipOutput } | { ok: false; reason: string }
  try {
    const frameRate = validateClipFrameRate(event.data?.frameRate)
    const clipSeconds = validateClipSeconds(event.data?.clipSeconds)
    if (event.data.kind !== undefined && event.data.kind !== 'motion')
      throw new ExtractionError('invalid-metadata')
    const motion = event.data.kind === 'motion'
    if (motion) {
      if (
        !motionClipWindows(event.data.duration!).length ||
        frameRate !== MOTION_FRAME_RATE ||
        clipSeconds !== MOTION_SECONDS
      )
        throw new ExtractionError('invalid-metadata')
      timeline = createPlayerTimelineGuard()
    }
    if (
      typeof VideoEncoder === 'undefined' ||
      typeof VideoDecoder === 'undefined' ||
      typeof OffscreenCanvas === 'undefined'
    )
      throw new ExtractionError('unsupported')
    const { file } = event.data
    if (!(file instanceof File)) throw new ExtractionError('invalid-metadata')
    const reads = emptyMetrics()
    const reader = createFileReader(file, 'buffered-1mib', reads, 100)
    input = new Input({
      formats: [MP4],
      source: new CustomSource({
        getSize: () => file.size,
        read: reader.read,
        maxCacheSize: 8 * 1024 * 1024,
        prefetchProfile: 'none',
      }),
    })
    const track = await input.getPrimaryVideoTrack()
    if (
      !track ||
      (await track.getCodec()) !== 'avc' ||
      !(await track.canDecode())
    )
      throw new ExtractionError('unsupported')
    checkDimensions(await track.getCodedWidth(), await track.getCodedHeight())
    const dimensions = clipDimensions(
      await track.getDisplayWidth(),
      await track.getDisplayHeight(),
    )
    if (motion) await timeline!.check(track, event.data.duration!)
    const startTime = motion ? 0 : Math.max(0, await track.getFirstTimestamp())
    const windows = motion
      ? motionClipWindows(event.data.duration!)
      : clipWindows(
          (await track.computeDuration()) - startTime,
          clipSeconds,
        ).map((window) => ({
          start: window.start + startTime,
          end: window.end + startTime,
        }))
    const codec = (await canEncodeVideo('avc', {
      ...dimensions,
      bitrate: 250000,
    }))
      ? 'avc'
      : (await canEncodeVideo('vp8', { ...dimensions, bitrate: 250000 }))
        ? 'vp8'
        : null
    if (!codec) throw new ExtractionError('unsupported')
    const metrics: ClipOutput['metrics'] = {
      setupMs: performance.now() - started,
      conversionMs: 0,
      firstClipMs: 0,
      totalMs: 0,
      readMs: 0,
      readMaxMs: 0,
    }
    const clips: ClipOutput['clips'] = []
    let outputBytes = 0
    for (const window of windows) {
      const buffer = boundedClipBuffer(
        Math.min(MAX_CLIP_BYTES, MAX_OUTPUT_BYTES - outputBytes),
      )
      const format =
        codec === 'avc'
          ? new Mp4OutputFormat({ fastStart: 'fragmented' })
          : new WebMOutputFormat()
      const output = new Output({
        format,
        target: new StreamTarget(new WritableStream({ write: buffer.write })),
      })
      const conversionStarted = performance.now()
      conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        trim: window,
        video: {
          ...dimensions,
          fit: 'contain',
          frameRate,
          codec,
          bitrate: 250000,
          forceTranscode: true,
          allowRotationMetadata: false,
        },
        audio: { discard: true },
        tags: {},
        showWarnings: false,
      })
      if (
        !conversion.isValid ||
        !conversion.utilizedTracks.some((track) => track.isVideoTrack())
      )
        throw new ExtractionError('unsupported')
      await conversion.execute()
      timeline?.assertSupported()
      metrics.conversionMs += performance.now() - conversionStarted
      const blob = buffer.blob(format.mimeType)
      outputBytes += blob.size
      clips.push({
        blob,
        start: window.start,
        duration: window.end - window.start,
      })
      if (clips.length === 1) metrics.firstClipMs = performance.now() - started
    }
    metrics.readMs = reads.readMs!
    metrics.readMaxMs = reads.readMaxMs!
    metrics.totalMs = performance.now() - started
    reply = {
      ok: true,
      output: validateClipOutput(
        {
          clips,
          ...dimensions,
          codec,
          metrics,
          readBytes: reader.readBytes,
          readCalls: reader.readCalls,
        },
        clipSeconds,
      ),
    }
  } catch (error) {
    reply = { ok: false, reason: safeFailure(error) }
  } finally {
    try {
      await conversion?.cancel()
      input?.dispose()
    } catch {
      reply = { ok: false, reason: 'extraction-failed' }
    }
    timeline?.dispose()
  }
  // Host wall time additionally includes worker startup/message delivery.
  if (reply!.ok) reply.output.metrics.totalMs = performance.now() - started
  self.postMessage(reply!)
}
