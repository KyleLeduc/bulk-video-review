import { describe, expect, test } from 'vitest'
import {
  enumerateTrialPairs,
  orderFixtureFiles,
  validatePipelineSuite,
} from './videoBenchmarkProtocol'

const configurations = [
  { backend: 'dom', foreground: 1, previews: 1 },
  { backend: 'dom', foreground: 2, previews: 1 },
]

describe('benchmark protocol', () => {
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
    settings: {
      configurations: [configurations[1]],
      repetitions: 1,
      includeCached: false,
    },
    fixture: { id: 'fixture-v1', verification: 'selection-only' },
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
        outputs: { valid: true },
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

  test('retains all incomplete, duplicate, hidden, invalid-output and mixed-build evidence', () => {
    const suite = completeSuite()
    const mutations = [
      { ...suite, status: 'interrupted' },
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
})
