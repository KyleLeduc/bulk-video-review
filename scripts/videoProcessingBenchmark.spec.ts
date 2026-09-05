// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import {
  enumerateCases,
  summarize,
  validateMatrix,
  resolveCorpusPaths,
  createProtocol,
  validateReport,
  validateOptions,
  isTerminalToast,
  qualifyObservations,
  validateMeasurements,
  verifyServedBuild,
  installShutdown,
  validateEvidenceSet,
  validateTerminalReport,
} from './videoProcessingBenchmark.mjs'

const temporaryDirectories: string[] = []
afterEach(async () => {
  for (const path of temporaryDirectories.splice(0))
    await rm(path, { recursive: true })
})

describe('reference benchmark evidence', () => {
  it('rejects nonterminal, misclassified and nonfinite/misordered reports', () => {
    const report = {
      status: 'completed',
      input: { unsupportedCount: 0 },
      timing: {
        queuedAtMs: 10,
        foregroundStartedAtMs: 11,
        foregroundCompletedAtMs: 20,
        pipelineCompletedAtMs: 30,
        queueWaitMs: 1,
        foregroundElapsedMs: 9,
        pipelineElapsedMs: 20,
      },
      foreground: {
        phase: 'complete',
        activeJobs: 0,
        pendingJobs: 0,
        counts: { scanned: 4, new: 3, retryQueue: 0, failed: 0, skipped: 1 },
      },
      backgroundPreviews: {
        counts: { queued: 0, processing: 0, pending: 0, total: 2 },
      },
    }
    const expected = { accepted: 4, supported: 2, invalid: 1 }
    expect(validateTerminalReport(report, 'cold', expected)).toEqual([])
    expect(
      validateTerminalReport(
        { ...report, status: 'running' },
        'cold',
        expected,
      ),
    ).toContain('run not terminal')
    expect(
      validateTerminalReport(
        { ...report, timing: { ...report.timing, foregroundStartedAtMs: NaN } },
        'cold',
        expected,
      ),
    ).toContain('invalid run timing')
    expect(
      validateTerminalReport(
        {
          ...report,
          foreground: {
            ...report.foreground,
            counts: { ...report.foreground.counts, new: 1 },
          },
        },
        'cold',
        expected,
      ),
    ).toContain('classification mismatch')
  })
  it('requires both complete browser matrices with matching build/corpus/runner/probe/resource identity', () => {
    const identity = {
      mode: 'measured',
      corpusId: 'reference-v1',
      corpusManifestSha256: 'a'.repeat(64),
      buildSha256: 'b'.repeat(64),
      runnerSha256: 'c'.repeat(64),
      probeSha256: 'd'.repeat(64),
      declaredAppRevision: 'e'.repeat(40),
      resources: {
        cpuMax: '400000 100000',
        memoryMax: '4294967296',
        shmBytes: 1073741824,
      },
      viewport: { width: 1440, height: 1000 },
      orderProtocol: 'rotating-configurations-v1',
      appUrl: 'http://127.0.0.1:4173',
      node: 'v24.20.0',
      os: 'linux',
      cacheScope: 'profile',
    }
    const rows = [
      ...enumerateCases('chrome', 1),
      ...enumerateCases('edge', 1),
    ].map((configuration) => ({
      configuration,
      status: 'passed',
      identity: {
        ...identity,
        browserVersion: {
          product:
            configuration.browser === 'chrome'
              ? 'Chrome/152.0.7977.64'
              : 'Edg/152.0.4191.53',
        },
      },
    }))
    expect(validateEvidenceSet(rows, 1)).toEqual([])
    const wrongBrowser = structuredClone(rows)
    for (const row of wrongBrowser)
      row.identity.browserVersion.product = 'Chrome/152.0.7977.64'
    expect(validateEvidenceSet(wrongBrowser, 1)).toContain(
      'browser product mismatch:edge/1/1/1/cold',
    )
    const undeclared = rows.map((row) => ({
      ...row,
      identity: { ...row.identity, declaredAppRevision: null },
    }))
    expect(validateEvidenceSet(undeclared, 1)).toContain(
      'invalid identity:chrome/1/1/1/cold',
    )
    const noShm = rows.map((row) => ({
      ...row,
      identity: {
        ...row.identity,
        resources: { ...row.identity.resources, shmBytes: undefined },
      },
    }))
    expect(validateEvidenceSet(noShm, 1)).toContain(
      'invalid identity:chrome/1/1/1/cold',
    )
    expect(validateEvidenceSet(rows.slice(0, 12), 1)).toContain(
      'missing:edge/1/1/1/cold',
    )
    const mixed = structuredClone(rows)
    mixed[12].identity.buildSha256 = 'f'.repeat(64)
    expect(validateEvidenceSet(mixed, 1)).toContain(
      'identity mismatch:edge/1/1/1/cold',
    )
    const pilot = structuredClone(rows)
    pilot[0].identity.mode = 'pilot'
    expect(validateEvidenceSet(pilot, 1)).toContain(
      'not measured:chrome/1/1/1/cold',
    )
  })
  it('recognizes settled failed previews so failures are retained promptly, not hidden behind a wait timeout', () => {
    expect(
      isTerminalToast(
        {
          headline: 'Generated 6 / 7',
          eyebrow: 'Background previews',
          stats: 'Generated 6 / 7Pending 0Failed 1',
        },
        'cold',
        7,
      ),
    ).toBe(true)
  })
  it('rotates configuration order between repetitions while keeping cold/warm pairs adjacent', () => {
    const cases = enumerateCases('chrome', 5)
    expect(cases[2]).toEqual({
      browser: 'chrome',
      foreground: 1,
      previews: 2,
      repetition: 1,
      cache: 'cold',
    })
    expect(cases[12]).toEqual({
      browser: 'chrome',
      foreground: 1,
      previews: 2,
      repetition: 2,
      cache: 'cold',
    })
    for (let repetition = 1; repetition <= 5; repetition++)
      expect(
        new Set(
          cases
            .filter((item) => item.repetition === repetition)
            .map((item) => `${item.foreground}/${item.previews}`),
        ).size,
      ).toBe(6)
  })
  it('rejects missing or inconsistent phase evidence and mismatched bytes/configuration', () => {
    const phase = (count: number, failed = 0) => ({
      count,
      completed: count - failed,
      failed,
      aborted: 0,
      totalMs: count,
      maxMs: 1,
    })
    const report = {
      schemaVersion: 1,
      input: { acceptedBytes: 100 },
      foreground: {
        concurrency: {
          mode: 'manual',
          requested: 2,
          effective: 2,
          peakActiveJobs: 2,
        },
      },
      backgroundPreviews: {
        concurrency: { mode: 'manual', requested: 1, effective: 1 },
        peakActiveJobs: 1,
        completedFrames: 18,
      },
      measurements: {
        version: 1,
        backend: 'dom',
        workersEnabled: false,
        foreground: {
          metadata: phase(3, 1),
          seek: phase(2),
          capture: phase(2),
          encode: phase(2),
          serialize: phase(2),
          persistence: phase(11),
        },
        previews: {
          metadata: phase(2),
          seek: phase(18),
          capture: phase(18),
          encode: phase(18),
          persistence: phase(6),
        },
        previewAttempts: { completed: 2, failed: 0, aborted: 0 },
      },
    }
    const configuration = { cache: 'cold', foreground: 2, previews: 1 }
    const expected = { supported: 2, invalid: 1, acceptedBytes: 100 }
    expect(validateMeasurements(report, configuration, expected)).toEqual([])
    expect(
      validateMeasurements(
        { ...report, schemaVersion: 2 },
        configuration,
        expected,
      ),
    ).toContain('measurement identity mismatch')
    expect(
      validateMeasurements(
        { ...report, input: { acceptedBytes: 1 } },
        configuration,
        expected,
      ),
    ).toContain('accepted byte total mismatch')
    expect(
      validateMeasurements(
        report,
        { ...configuration, foreground: 4 },
        expected,
      ),
    ).toContain('concurrency mismatch')
    const missing = structuredClone(report)
    delete (
      missing.measurements.previews as Partial<
        typeof report.measurements.previews
      >
    ).encode
    expect(validateMeasurements(missing, configuration, expected)).toContain(
      'phase count mismatch:previews/encode',
    )
    const corrupt = structuredClone(report)
    const wrongOutcome = structuredClone(report)
    wrongOutcome.measurements.foreground.metadata.completed = 3
    wrongOutcome.measurements.foreground.metadata.failed = 0
    expect(
      validateMeasurements(wrongOutcome, configuration, expected),
    ).toContain('phase outcome mismatch:foreground/metadata')
    const wrongPersistence = structuredClone(report)
    wrongPersistence.measurements.foreground.persistence = phase(12)
    expect(
      validateMeasurements(wrongPersistence, configuration, expected),
    ).toContain('phase count mismatch:foreground/persistence')
    const auto = structuredClone(report)
    auto.foreground.concurrency.mode = 'auto'
    expect(validateMeasurements(auto, configuration, expected)).toContain(
      'concurrency mismatch',
    )
    corrupt.measurements.previews.seek.totalMs = NaN
    expect(validateMeasurements(corrupt, configuration, expected)).toContain(
      'invalid phase aggregate:previews/seek',
    )
  })
  it('binds the actual served content to the local built artifact, rejecting stale content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bvr-build-test-'))
    temporaryDirectories.push(root)
    await writeFile(join(root, 'index.html'), 'built-app')
    let content = 'built-app'
    const server = createServer((_request, response) => response.end(content))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    try {
      const url = `http://127.0.0.1:${address.port}/`
      expect(await verifyServedBuild(root, url)).toMatch(/^[a-f0-9]{64}$/)
      content = 'stale-app'
      await expect(verifyServedBuild(root, url)).rejects.toThrow(
        'Served build mismatch',
      )
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
  it('aborts once on SIGINT/SIGTERM and removes its handlers at cleanup', () => {
    const signals = new EventEmitter()
    const controller = new AbortController()
    let closeCount = 0
    const shutdown = installShutdown(signals, controller, () => {
      closeCount++
    })
    signals.emit('SIGTERM')
    signals.emit('SIGINT')
    expect(controller.signal.aborted).toBe(true)
    expect(closeCount).toBe(1)
    shutdown.dispose()
    expect(
      signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT'),
    ).toBe(0)
  })
  it('allows only the expected failed metadata retries in an otherwise cached warm run', () => {
    const expected = {
      selected: 4,
      accepted: 4,
      supported: 2,
      invalid: 1,
      duplicates: 1,
    }
    const report = {
      input: { selectedCount: 4, acceptedCount: 4 },
      timing: { pipelineCompletedAtMs: 20 },
      foreground: {
        counts: {
          total: 4,
          completed: 4,
          created: 0,
          existing: 2,
          failed: 0,
          skipped: 1,
          retryQueue: 1,
          duplicates: 1,
        },
      },
      backgroundPreviews: { counts: { ready: 0, failed: 0 } },
      measurements: {
        foreground: {
          metadata: { count: 1, completed: 0, failed: 1, aborted: 0 },
        },
        previews: {},
        previewAttempts: { started: 0, settled: 0 },
      },
    }
    expect(validateReport(report, 'warm', expected)).toEqual([])
    expect(
      validateReport(
        {
          ...report,
          measurements: {
            ...report.measurements,
            foreground: {
              metadata: { count: 2, completed: 1, failed: 1, aborted: 0 },
            },
          },
        },
        'warm',
        expected,
      ),
    ).toContain('warm media work or cache counts mismatch')
  })
  it('marks missing in-workload samples unavailable and excludes preselection/postsettlement samples', () => {
    const report = {
      timing: { foregroundStartedAtMs: 100, pipelineCompletedAtMs: 200 },
    }
    const interactions = {
      timeOrigin: 0,
      trustedKeydowns: [
        { eventAtMs: 90, handlerDelayMs: 90, nextFrameOpportunityMs: 100 },
        { eventAtMs: 130, handlerDelayMs: 3, nextFrameOpportunityMs: 10 },
        { eventAtMs: 210, handlerDelayMs: 99, nextFrameOpportunityMs: 100 },
      ],
    }
    const memory = {
      samples: [
        { startedAtMs: 90, atMs: 110, totalRssKiB: 999 },
        { startedAtMs: 120, atMs: 125, totalRssKiB: 200 },
        { startedAtMs: 190, atMs: 210, totalRssKiB: 888 },
      ],
    }
    expect(qualifyObservations(report, interactions, memory)).toMatchObject({
      handlerDelayMs: { count: 1, median: 3 },
      nextFrameOpportunityMs: { count: 1, median: 10 },
      browserProcessRssKiB: { count: 1, max: 200 },
      availability: { interactions: 'observed', memory: 'observed' },
    })
    expect(
      qualifyObservations(
        report,
        { ...interactions, trustedKeydowns: [] },
        { samples: [] },
      ),
    ).toMatchObject({
      availability: { interactions: 'unavailable', memory: 'unavailable' },
    })
  })
  it('reads adjacent compiled Vue stat spans without requiring whitespace after the pending count', () => {
    const toast = {
      headline: 'Generated 7 / 7',
      eyebrow: 'Background previews',
      stats: 'Generated 7 / 7Pending 0Failed 0',
    }
    expect(isTerminalToast(toast, 'cold', 7)).toBe(true)
    expect(
      isTerminalToast(
        { ...toast, stats: 'Generated 7 / 7Pending 01Failed 0' },
        'cold',
        7,
      ),
    ).toBe(false)
  })
  it('limits CLI execution to explicit inputs, loopback apps and supported browsers', () => {
    const options = {
      browser: 'chrome',
      corpus: '/corpus',
      output: '/results/pilot.jsonl',
      url: 'http://127.0.0.1:4173',
      repetitions: '5',
    }
    expect(validateOptions(options)).toMatchObject({
      repetitions: 5,
      browser: 'chrome',
    })
    expect(() =>
      validateOptions({ ...options, url: 'https://example.com' }),
    ).toThrow('loopback')
    expect(() => validateOptions({ ...options, browser: 'shell' })).toThrow(
      'browser',
    )
    expect(() => validateOptions({ ...options, output: undefined })).toThrow(
      'output',
    )
    expect(() => validateOptions({ ...options, repetitions: '0' })).toThrow(
      'repetitions',
    )
  })
  it('does not confuse foreground completion or partial previews with pipeline completion', () => {
    expect(
      isTerminalToast(
        {
          headline: 'Complete · 10 / 10',
          eyebrow: 'Foreground ingestion',
          stats: '',
        },
        'cold',
        7,
      ),
    ).toBe(false)
    expect(
      isTerminalToast(
        {
          headline: 'Generated 7 / 7',
          eyebrow: 'Background previews',
          stats: 'Generated 7 / 7 Pending 0 Failed 0',
        },
        'cold',
        7,
      ),
    ).toBe(true)
    expect(
      isTerminalToast(
        {
          headline: 'Generated 6 / 7',
          eyebrow: 'Background previews',
          stats: 'Generated 6 / 7 Pending 1 Failed 0',
        },
        'cold',
        7,
      ),
    ).toBe(false)
    expect(
      isTerminalToast(
        {
          headline: 'Complete · 10 / 10',
          eyebrow: 'Foreground ingestion',
          stats: '',
        },
        'warm',
        7,
      ),
    ).toBe(true)
  })
  it('enumerates 30 ordered cold/warm pairs per browser without mixing cache states', () => {
    const cases = enumerateCases('chrome', 5)
    expect(cases).toHaveLength(60)
    expect(new Set(cases.map((item) => JSON.stringify(item))).size).toBe(60)
    expect(cases.slice(0, 2)).toEqual([
      {
        browser: 'chrome',
        foreground: 1,
        previews: 1,
        repetition: 1,
        cache: 'cold',
      },
      {
        browser: 'chrome',
        foreground: 1,
        previews: 1,
        repetition: 1,
        cache: 'warm',
      },
    ])
    expect(cases.at(-1)).toEqual({
      browser: 'chrome',
      foreground: 2,
      previews: 2,
      repetition: 5,
      cache: 'warm',
    })
    expect(() => enumerateCases('firefox', 5)).toThrow()
    expect(() => enumerateCases('edge', 0)).toThrow()
  })

  it('reports finite sample count, median, nearest-rank p95 and range without inventing missing values', () => {
    expect(summarize([null, undefined, NaN, Infinity])).toEqual({
      count: 0,
      median: null,
      p95: null,
      min: null,
      max: null,
    })
    expect(summarize([9, 1, null, 3, 5])).toEqual({
      count: 4,
      median: 4,
      p95: 9,
      min: 1,
      max: 9,
    })
  })

  it('rejects incomplete, duplicate, unexpected and failed matrix rows', () => {
    const cases = enumerateCases('edge', 1)
    const rows = cases.map((configuration) => ({
      configuration,
      status: 'passed',
    }))
    expect(validateMatrix(rows, cases)).toEqual([])
    expect(validateMatrix(rows.slice(1), cases)).toContain(
      'missing:edge/1/1/1/cold',
    )
    expect(validateMatrix([...rows, rows[0]], cases)).toContain(
      'duplicate:edge/1/1/1/cold',
    )
    expect(
      validateMatrix(
        [{ configuration: cases[0], status: 'failed' }, ...rows.slice(1)],
        cases,
      ),
    ).toContain('failed:edge/1/1/1/cold')
    expect(
      validateMatrix(
        [
          { configuration: { ...cases[0], cache: 'other' }, status: 'passed' },
          ...rows,
        ],
        cases,
      ),
    ).toContain('unexpected:edge/1/1/1/other')
  })

  it('resolves only regular corpus files inside the real root, rejecting traversal and escaping symlinks', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'bvr-corpus-test-'))
    temporaryDirectories.push(parent)
    const root = join(parent, 'corpus')
    await mkdir(root)
    await writeFile(join(root, 'clip.mp4'), 'fixture')
    await writeFile(join(parent, 'outside.mp4'), 'not permitted')
    await symlink(join(parent, 'outside.mp4'), join(root, 'escape.mp4'))
    expect(await resolveCorpusPaths(root, ['clip.mp4'])).toEqual([
      join(root, 'clip.mp4'),
    ])
    await expect(resolveCorpusPaths(root, ['../outside.mp4'])).rejects.toThrow(
      'outside corpus',
    )
    await expect(resolveCorpusPaths(root, ['escape.mp4'])).rejects.toThrow(
      'outside corpus',
    )
    await expect(resolveCorpusPaths(root, ['.'])).rejects.toThrow(
      'regular file',
    )
  })

  it('validates settled counts and cached reuse, rather than accepting a partial warm report', () => {
    const report = {
      input: { selectedCount: 4, acceptedCount: 4 },
      timing: { pipelineCompletedAtMs: 10 },
      foreground: {
        counts: {
          total: 4,
          completed: 4,
          created: 2,
          existing: 0,
          failed: 1,
          skipped: 0,
          duplicates: 1,
        },
      },
      backgroundPreviews: { counts: { ready: 2, failed: 0 } },
      measurements: {
        foreground: { metadata: { count: 3 } },
        previews: { encode: { count: 18 } },
        previewAttempts: { started: 2, settled: 2 },
      },
    }
    const expected = {
      selected: 4,
      accepted: 4,
      supported: 2,
      invalid: 1,
      duplicates: 1,
    }
    expect(validateReport(report, 'cold', expected)).toEqual([])
    expect(
      validateReport(
        { ...report, timing: { pipelineCompletedAtMs: null } },
        'cold',
        expected,
      ),
    ).toContain('pipeline not settled')
    expect(validateReport(report, 'warm', expected)).toContain(
      'warm media work or cache counts mismatch',
    )
  })
})

describe('bounded native browser protocol requests', () => {
  class Socket extends EventTarget {
    readyState = 1
    sent: { id: number; method: string }[] = []
    send(message: string) {
      this.sent.push(JSON.parse(message))
    }
    close() {
      this.readyState = 3
      this.dispatchEvent(new Event('close'))
    }
    reply(message: unknown) {
      this.dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify(message) }),
      )
    }
  }
  it('matches replies by id, ignoring events and preserving protocol failures', async () => {
    const socket = new Socket()
    const protocol = createProtocol(socket, 100)
    const first = protocol.send('Page.enable')
    socket.reply({ method: 'Page.loadEventFired', params: {} })
    socket.reply({ id: socket.sent[0]?.id, result: { enabled: true } })
    expect(await first).toEqual({ enabled: true })
    const second = protocol.send('Missing.command')
    socket.reply({
      id: socket.sent[1]?.id,
      error: { message: 'Unknown command' },
    })
    await expect(second).rejects.toThrow('Unknown command')
  })
  it('rejects overdue requests and every pending request on close', async () => {
    const socket = new Socket()
    const protocol = createProtocol(socket, 10)
    await expect(protocol.send('Page.enable')).rejects.toThrow('timed out')
    const pending = protocol.send('DOM.getDocument')
    socket.close()
    await expect(pending).rejects.toThrow('closed')
    await expect(protocol.send('Page.enable')).rejects.toThrow('closed')
  })
})
