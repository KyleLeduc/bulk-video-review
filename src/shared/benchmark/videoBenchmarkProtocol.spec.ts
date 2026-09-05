import { describe, expect, test } from 'vitest'
import {
  enumerateTrialPairs,
  orderFixtureFiles,
  validatePipelineSuite as validateSuite,
  validPreviewTimestamps,
} from './videoBenchmarkProtocol'
import reference from './referenceFixtures.json'
const validatePipelineSuite = (suite: unknown) =>
  validateSuite(suite, reference)

const phase = (count: number, failed = 0) => ({
  count,
  completed: count - failed,
  failed,
  aborted: 0,
  totalMs: 1,
  maxMs: 1,
})
const completeReport = () => ({
  schemaVersion: 1,
  status: 'completed',
  input: {
    selectedCount: 10,
    acceptedCount: 10,
    unsupportedCount: 0,
    acceptedBytes: reference.files.reduce((sum, file) => sum + file.bytes, 0),
  },
  timing: {
    queuedAtMs: 10,
    foregroundStartedAtMs: 11,
    foregroundCompletedAtMs: 15,
    pipelineCompletedAtMs: 20,
    queueWaitMs: 1,
    foregroundElapsedMs: 4,
    pipelineElapsedMs: 10,
  },
  foreground: {
    phase: 'complete',
    activeJobs: 0,
    pendingJobs: 0,
    concurrency: {
      mode: 'manual',
      requested: 2,
      effective: 2,
      peakActiveJobs: 2,
    },
    counts: {
      total: 10,
      completed: 10,
      scanned: 10,
      duplicates: 1,
      new: 9,
      retryQueue: 0,
      created: 7,
      existing: 0,
      failed: 0,
      skipped: 2,
    },
  },
  backgroundPreviews: {
    counts: {
      total: 7,
      ready: 7,
      failed: 0,
      pending: 0,
      queued: 0,
      processing: 0,
    },
    concurrency: { mode: 'manual', requested: 1, effective: 1 },
    peakActiveJobs: 1,
    completedFrames: 63,
  },
  measurements: {
    version: 1,
    backend: 'dom',
    workersEnabled: false,
    foreground: {
      metadata: phase(9, 2),
      seek: phase(7),
      capture: phase(7),
      encode: phase(7),
      serialize: phase(7),
      persistence: phase(34),
    },
    previews: {
      metadata: phase(7),
      seek: phase(63),
      capture: phase(63),
      encode: phase(63),
      persistence: phase(21),
    },
    previewAttempts: {
      started: 7,
      settled: 7,
      completed: 7,
      failed: 0,
      aborted: 0,
    },
  },
  environment: { userAgent: 'Chrome/test' },
})

const configurations = [
  { backend: 'dom', foreground: 1, previews: 1 },
  { backend: 'dom', foreground: 2, previews: 1 },
]

describe('benchmark protocol', () => {
  test('preserves the real DOM pipeline integer-second targets, including repeated short-video targets', () => {
    expect(validPreviewTimestamps([0, 1, 2, 3, 4, 4, 5, 6, 7], 8)).toBe(true)
    expect(validPreviewTimestamps([0, 1, 2, 3, 4, 5, 4, 6, 7], 8)).toBe(false)
    expect(validPreviewTimestamps([0, 1, 2, 3, 4, 4, 5, 6, 8], 8)).toBe(false)
    expect(validPreviewTimestamps([0, 1], 8)).toBe(false)
  })
  test('rotates whole configurations between repetitions without reordering a pair', () => {
    expect(enumerateTrialPairs(configurations, 2)).toEqual([
      { ...configurations[0], repetition: 1 },
      { ...configurations[1], repetition: 1 },
      { ...configurations[1], repetition: 2 },
      { ...configurations[0], repetition: 2 },
    ])
  })

  test.each([0, 6, 1.5, NaN])(
    'rejects invalid repetition count %s',
    (repetitions) => {
      expect(() => enumerateTrialPairs(configurations, repetitions)).toThrow()
    },
  )

  test.each(
    [
      [],
      [configurations[0], configurations[0]],
      [{ backend: 'webcodecs', foreground: 2, previews: 1 }],
      [{ backend: 'dom', foreground: 3, previews: 1 }],
      [{ backend: 'dom', foreground: 2, previews: 4 }],
    ].map((values) => [values] as const),
  )('rejects absent, duplicated and unavailable configurations', (values) => {
    expect(() => enumerateTrialPairs(values, 1)).toThrow()
  })

  const manifest = {
    files: [
      { path: 'clips/one.mp4', bytes: 1, sha256: 'a'.repeat(64) },
      { path: 'clips/two.mp4', bytes: 2, sha256: 'b'.repeat(64) },
      { path: 'duplicate/one.mp4', bytes: 1, sha256: 'a'.repeat(64) },
    ],
  }
  const one = () => new File(['a'], 'one.mp4')
  const two = () => new File(['bb'], 'two.mp4')

  test('orders selected Files by manifest and preserves the known duplicate', () => {
    const files = [two(), one(), one()]
    const ordered = orderFixtureFiles(files, manifest)
    expect(ordered).toEqual([files[1], files[0], files[2]])
    expect(ordered[0]).toBe(files[1])
  })

  test('accepts a selected directory prefix but rejects conflicting relative paths', () => {
    const a = one(),
      b = two(),
      duplicate = one()
    Object.defineProperty(a, 'webkitRelativePath', {
      value: 'reference/clips/one.mp4',
    })
    Object.defineProperty(b, 'webkitRelativePath', {
      value: 'reference/clips/two.mp4',
    })
    Object.defineProperty(duplicate, 'webkitRelativePath', {
      value: 'reference/duplicate/one.mp4',
    })
    expect(orderFixtureFiles([duplicate, b, a], manifest)).toEqual([
      a,
      b,
      duplicate,
    ])
    const wrong = one()
    Object.defineProperty(wrong, 'webkitRelativePath', {
      value: 'other/unexpected/one.mp4',
    })
    expect(() => orderFixtureFiles([wrong, b, duplicate], manifest)).toThrow()
  })

  test.each(
    [
      [one(), two()],
      [one(), two(), one(), one()],
      [one(), new File(['wrong'], 'two.mp4'), one()],
    ].map((files) => [files] as const),
  )('rejects missing, extra and wrong-sized selections', (files) => {
    expect(() => orderFixtureFiles(files, manifest)).toThrow()
  })

  test('rejects an ambiguous flat selection with differing expected contents', () => {
    const ambiguous = {
      files: manifest.files.map((file, index) => ({
        ...file,
        sha256: String(index).repeat(64),
      })),
    }
    expect(() => orderFixtureFiles([one(), two(), one()], ambiguous)).toThrow()
  })

  test.each([
    null,
    {},
    { protocolVersion: 1 },
    {
      protocolVersion: 2,
      mode: 'pipeline-no-gallery-v1',
      status: 'completed',
      settings: { configurations, repetitions: 1, includeCached: true },
      rows: [],
    },
  ])(
    'rejects malformed, legacy and missing evidence rather than completing it',
    (suite) => {
      expect(validatePipelineSuite(suite).length).toBeGreaterThan(0)
    },
  )

  const completeSuite = () => ({
    protocolVersion: 2,
    mode: 'pipeline-no-gallery-v1',
    status: 'completed',
    cleanup: 'complete',
    errors: [],
    orphanedPairs: [],
    settings: {
      configurations: [configurations[1]],
      repetitions: 1,
      includeCached: false,
    },
    fixture: { id: reference.id, verification: 'selection-only' },
    identity: {
      build: {
        revision: 'a'.repeat(40),
        assetsSha256: 'b'.repeat(64),
        dirty: false,
      },
      userAgent: 'Chrome/test',
    },
    rows: [
      {
        configuration: { ...configurations[1], repetition: 1, cache: 'cold' },
        status: 'passed',
        cleanup: 'complete',
        hidden: false,
        wallMs: 10,
        outputs: { valid: true, videos: 7, frames: 63, errors: [] },
        errors: [],
        report: completeReport(),
        build: {
          revision: 'a'.repeat(40),
          assetsSha256: 'b'.repeat(64),
          dirty: false,
        },
      },
    ],
  })

  test('accepts a complete same-identity ordered suite envelope', () => {
    expect(validatePipelineSuite(completeSuite())).toEqual([])
  })

  test('allows explicitly unqualified development summaries without qualifying CLI evidence', () => {
    const suite = completeSuite()
    const build = {
      ...suite.identity.build,
      assetsSha256: null,
      source: 'dev-unqualified',
    }
    const dev = {
      ...suite,
      identity: { ...suite.identity, build },
      rows: suite.rows.map((row) => ({ ...row, build })),
    }
    expect(validateSuite(dev, reference).length).toBeGreaterThan(0)
    expect(
      validateSuite(dev, reference, { allowDevelopmentBuild: true }),
    ).toEqual([])
  })

  test('retains all incomplete, duplicate, hidden, invalid-output and mixed-build evidence', () => {
    const suite = completeSuite()
    const mutations = [
      { ...suite, status: 'interrupted' },
      { ...suite, errors: ['Unresolved failure'] },
      { ...suite, errors: undefined },
      { ...suite, orphanedPairs: ['owned-pair'] },
      { ...suite, orphanedPairs: undefined },
      { ...suite, cleanup: 'failed' },
      { ...suite, rows: [] },
      { ...suite, rows: [...suite.rows, ...suite.rows] },
      { ...suite, rows: [{ ...suite.rows[0], hidden: true }] },
      { ...suite, rows: [{ ...suite.rows[0], status: 'failed' }] },
      { ...suite, rows: [{ ...suite.rows[0], wallMs: NaN }] },
      { ...suite, rows: [{ ...suite.rows[0], outputs: { valid: false } }] },
      {
        ...suite,
        rows: [
          {
            ...suite.rows[0],
            build: { ...suite.identity.build, revision: 'c'.repeat(40) },
          },
        ],
      },
    ]
    for (const changed of mutations)
      expect(validatePipelineSuite(changed).length).toBeGreaterThan(0)
  })

  test('revalidates actual reports and output counts instead of trusting passed flags', () => {
    const suite = completeSuite()
    for (const patch of [
      { report: null },
      {
        report: { ...completeReport(), measurements: { backend: 'webcodecs' } },
      },
      { outputs: { valid: true, videos: 0, frames: 0, errors: [] } },
      {
        report: {
          ...completeReport(),
          environment: { userAgent: 'different' },
        },
      },
      { errors: ['Unresolved problem'] },
    ])
      expect(
        validatePipelineSuite({
          ...suite,
          rows: [{ ...suite.rows[0], ...patch }],
        }).length,
      ).toBeGreaterThan(0)
  })
})
