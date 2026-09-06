import {
  ExtractionError,
  readBudgetForCount,
  type PreviewCount,
  type ExtractionMetrics,
} from './previewExtraction'

export type BenchmarkReaderMode = 'direct' | 'buffered-1mib'
const WINDOW_BYTES = 1024 * 1024

// Benchmark-only I/O boundary. These limits do not bound parser/decoder memory.
export function createBenchmarkFileReader(
  file: Blob,
  mode: BenchmarkReaderMode,
  metrics: ExtractionMetrics,
  count: PreviewCount = 9,
) {
  const readBudget = readBudgetForCount(count)
  if (mode !== 'direct' && mode !== 'buffered-1mib')
    throw new ExtractionError('unsupported')
  let readBytes = 0
  let readCalls = 0
  let windowStart = 0
  let window: Uint8Array | undefined
  let tail = Promise.resolve()
  metrics.readMs = metrics.readMaxMs = 0

  async function physicalRead(start: number, end: number) {
    if (readBytes + end - start > readBudget)
      throw new ExtractionError('read-limit')
    // Reserve before awaiting; failed reads still consume the budget.
    readBytes += end - start
    readCalls++
    const started = performance.now()
    try {
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer())
      if (bytes.byteLength !== end - start)
        throw new ExtractionError('extraction-failed')
      return bytes
    } finally {
      const elapsed = performance.now() - started
      metrics.readMs! += elapsed
      metrics.readMaxMs = Math.max(metrics.readMaxMs!, elapsed)
    }
  }

  async function bufferedRead(start: number, end: number) {
    if (window && start >= windowStart && end <= windowStart + window.length)
      return window.slice(start - windowStart, end - windowStart)
    window = undefined
    if (end - start > WINDOW_BYTES) return physicalRead(start, end)
    windowStart = start
    window = await physicalRead(
      start,
      Math.min(file.size, start + WINDOW_BYTES),
    )
    // Exact copies prevent small library cache entries retaining the full window.
    return window.slice(0, end - start)
  }

  return {
    get readBytes() {
      return readBytes
    },
    get readCalls() {
      return readCalls
    },
    async read(start: number, end: number): Promise<Uint8Array> {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end > file.size ||
        end <= start ||
        end - start > 16 * WINDOW_BYTES
      )
        throw new ExtractionError('read-limit')
      if (mode === 'direct') return physicalRead(start, end)
      const result = tail.then(() => bufferedRead(start, end))
      // Preserve this request's rejection while allowing the queue to settle.
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}
