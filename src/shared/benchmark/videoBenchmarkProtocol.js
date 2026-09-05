/** Only implemented configurations may enter a suite. A pair stays adjacent. */
export function enumerateTrialPairs(configurations, repetitions) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5)
    throw new TypeError('Repetitions must be 1–5')
  if (
    !Array.isArray(configurations) ||
    !configurations.length ||
    configurations.length > 6
  )
    throw new TypeError('Select 1–6 configurations')
  const seen = new Set()
  for (const configuration of configurations) {
    const { backend, foreground, previews } = configuration
    const key = `${backend}/${foreground}/${previews}`
    if (
      backend !== 'dom' ||
      ![1, 2, 4].includes(foreground) ||
      ![1, 2].includes(previews) ||
      seen.has(key)
    )
      throw new TypeError('Unavailable or duplicate configuration')
    seen.add(key)
  }
  return Array.from({ length: repetitions }, (_, index) =>
    configurations.map((_, offset) => ({
      ...configurations[(index + offset) % configurations.length],
      repetition: index + 1,
    })),
  ).flat()
}

/** Selection identity only: never reads media bytes or claims hash verification. */
export function orderFixtureFiles(files, manifest) {
  const remaining = Array.from(files)
  if (remaining.length !== manifest.files.length)
    throw new TypeError('Select exactly the fixture files')
  return manifest.files.map((expected) => {
    const basename = expected.path.split('/').at(-1)
    const candidates = remaining.filter(
      (file) => file.name === basename && file.size === expected.bytes,
    )
    const matched =
      candidates.find((file) => {
        const path = file.webkitRelativePath
        return (
          path && (path === expected.path || path.endsWith(`/${expected.path}`))
        )
      }) ?? candidates.find((file) => !file.webkitRelativePath)
    if (!matched)
      throw new TypeError(`Missing or mismatched fixture: ${expected.path}`)
    if (
      !matched.webkitRelativePath &&
      manifest.files.some(
        (file) =>
          file.path.split('/').at(-1) === basename &&
          file.bytes === expected.bytes &&
          file.sha256 !== expected.sha256,
      )
    )
      throw new TypeError(
        'Ambiguous flat selection: select the fixture directory',
      )
    remaining.splice(remaining.indexOf(matched), 1)
    return matched
  })
}

/** Returns reasons a saved v2 suite cannot be treated as a complete comparison. */
export function validPreviewTimestamps(timestamps, duration) {
  return (
    Number.isFinite(duration) &&
    duration > 0 &&
    timestamps.length === 9 &&
    timestamps.every(
      (time, index) => time === Math.floor((duration / 10) * (index + 1)),
    )
  )
}

export function validatePipelineSuite(
  suite,
  manifest,
  { allowDevelopmentBuild = false } = {},
) {
  const errors = []
  try {
    if (suite?.protocolVersion !== 2 || suite.mode !== 'pipeline-no-gallery-v1')
      return ['Unsupported benchmark envelope']
    if (suite.status !== 'completed' || suite.cleanup !== 'complete')
      errors.push('Suite incomplete')
    if (
      !Array.isArray(suite.errors) ||
      suite.errors.length ||
      !Array.isArray(suite.orphanedPairs) ||
      suite.orphanedPairs.length
    )
      errors.push('Unresolved suite errors or cleanup')
    if (!manifest?.expected || suite.fixture?.id !== manifest.id)
      return ['Unrecognized fixed fixture']
    const fixtureExpected = {
      ...manifest.expected,
      acceptedBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    }
    const { configurations, repetitions, includeCached } = suite.settings
    if (typeof includeCached !== 'boolean')
      errors.push('Invalid cache selection')
    const expected = enumerateTrialPairs(configurations, repetitions).flatMap(
      (pair) =>
        (includeCached ? ['cold', 'warm'] : ['cold']).map((cache) => ({
          ...pair,
          cache,
        })),
    )
    if (
      !suite.fixture?.id ||
      !['selection-only', 'sha256-verified'].includes(
        suite.fixture.verification,
      )
    )
      errors.push('Missing fixture identity')
    const build = suite.identity?.build
    if (
      !build ||
      !suite.identity?.userAgent ||
      (!/^[a-f0-9]{64}$/.test(build.assetsSha256) &&
        !(
          allowDevelopmentBuild &&
          build.source === 'dev-unqualified' &&
          build.assetsSha256 === null
        ))
    )
      errors.push('Missing build/browser identity')
    if (suite.rows.length !== expected.length)
      errors.push('Missing or duplicate rows')
    for (const [index, row] of suite.rows.entries()) {
      try {
        errors.push(
          ...validateTerminalReport(
            row.report,
            row.configuration.cache,
            fixtureExpected,
          ),
          ...validateReport(
            row.report,
            row.configuration.cache,
            fixtureExpected,
          ),
          ...validateMeasurements(
            row.report,
            row.configuration,
            fixtureExpected,
          ),
        )
        if (row.report.environment?.userAgent !== suite.identity.userAgent)
          errors.push(`Mixed browser:${index}`)
      } catch {
        errors.push(`Malformed report:${index}`)
      }
      if (
        row.outputs?.videos !== fixtureExpected.supported ||
        row.outputs?.frames !== fixtureExpected.supported * 9 ||
        !Array.isArray(row.outputs?.errors) ||
        row.outputs.errors.length ||
        !Array.isArray(row.errors) ||
        row.errors.length
      )
        errors.push(`Invalid outputs:${index}`)
      if (
        !expected[index] ||
        ['backend', 'foreground', 'previews', 'repetition', 'cache'].some(
          (key) => row.configuration?.[key] !== expected[index][key],
        )
      )
        errors.push(`Wrong trial order:${index}`)
      if (
        row.status !== 'passed' ||
        row.cleanup !== 'complete' ||
        row.hidden !== false ||
        !Number.isFinite(row.wallMs) ||
        row.wallMs < 0 ||
        row.outputs?.valid !== true
      )
        errors.push(`Invalid trial:${index}`)
      if (
        ['revision', 'assetsSha256', 'dirty'].some(
          (key) => row.build?.[key] !== build?.[key],
        )
      )
        errors.push(`Mixed build:${index}`)
    }
  } catch {
    errors.push('Malformed benchmark evidence')
  }
  return errors
}
/* Shared pure validation also preserves the legacy CLI v1 contract. */
export function validateTerminalReport(report, cache, expected) {
  const errors = []
  const foreground = report.foreground
  const background = report.backgroundPreviews.counts
  if (
    report.status !== 'completed' ||
    foreground.phase !== 'complete' ||
    foreground.activeJobs !== 0 ||
    foreground.pendingJobs !== 0 ||
    ['queued', 'processing', 'pending'].some((key) => background[key] !== 0)
  )
    errors.push('run not terminal')
  const counts = foreground.counts
  const cold = cache === 'cold'
  if (
    report.input.unsupportedCount !== 0 ||
    counts.scanned !== expected.accepted ||
    counts.new !== (cold ? expected.supported + expected.invalid : 0) ||
    counts.retryQueue !== (cold ? 0 : expected.invalid) ||
    counts.failed !== 0 ||
    counts.skipped !== expected.invalid ||
    background.total !== (cold ? expected.supported : 0)
  )
    errors.push('classification mismatch')
  const timing = report.timing
  const stamps = [
    timing.queuedAtMs,
    timing.foregroundStartedAtMs,
    timing.foregroundCompletedAtMs,
    timing.pipelineCompletedAtMs,
  ]
  if (
    !stamps.every(Number.isFinite) ||
    stamps.some((value, index) => index > 0 && value < stamps[index - 1]) ||
    ![
      timing.queueWaitMs,
      timing.foregroundElapsedMs,
      timing.pipelineElapsedMs,
    ].every((value) => Number.isFinite(value) && value >= 0) ||
    timing.queueWaitMs !== stamps[1] - stamps[0] ||
    timing.pipelineElapsedMs !== stamps[3] - stamps[0]
  )
    errors.push('invalid run timing')
  return errors
}

export function validateMeasurements(report, configuration, expected) {
  const errors = []
  const measurements = report.measurements
  if (
    report.schemaVersion !== 1 ||
    measurements?.version !== 1 ||
    measurements.backend !== 'dom' ||
    measurements.workersEnabled !== false
  )
    errors.push('measurement identity mismatch')
  if (report.input.acceptedBytes !== expected.acceptedBytes)
    errors.push('accepted byte total mismatch')
  for (const [lane, requested] of [
    ['foreground', configuration.foreground],
    ['backgroundPreviews', configuration.previews],
  ]) {
    const actual = report[lane]
    const peak = actual.peakActiveJobs ?? actual.concurrency.peakActiveJobs
    if (
      actual.concurrency.mode !== 'manual' ||
      !Number.isInteger(peak) ||
      peak < 0 ||
      ((lane === 'foreground' || configuration.cache === 'cold') &&
        peak === 0) ||
      actual.concurrency.requested !== requested ||
      actual.concurrency.effective !== requested ||
      peak > requested
    )
      errors.push('concurrency mismatch')
  }
  const valid = expected.supported
  const cold = configuration.cache === 'cold'
  const expectedCounts = {
    foreground: {
      metadata: cold ? valid + expected.invalid : expected.invalid,
      seek: cold ? valid : 0,
      capture: cold ? valid : 0,
      encode: cold ? valid : 0,
      serialize: cold ? valid : 0,
      persistence: (cold ? 4 : 2) * valid + 3 * expected.invalid,
    },
    previews: {
      metadata: cold ? valid : 0,
      seek: cold ? valid * 9 : 0,
      capture: cold ? valid * 9 : 0,
      encode: cold ? valid * 9 : 0,
      serialize: 0,
      persistence: cold ? valid * 3 : 0,
    },
  }
  for (const lane of ['foreground', 'previews']) {
    for (const [phase, count] of Object.entries(expectedCounts[lane]))
      if ((measurements[lane]?.[phase]?.count ?? 0) !== count)
        errors.push(`phase count mismatch:${lane}/${phase}`)
    for (const [phase, sample] of Object.entries(measurements[lane] ?? {})) {
      const expectedFailed =
        lane === 'foreground' && phase === 'metadata' ? expected.invalid : 0
      if (
        sample.failed !== expectedFailed ||
        sample.aborted !== 0 ||
        sample.completed !== sample.count - expectedFailed
      )
        errors.push(`phase outcome mismatch:${lane}/${phase}`)
      if (
        ![
          'metadata',
          'seek',
          'capture',
          'encode',
          'serialize',
          'persistence',
        ].includes(phase) ||
        !['count', 'completed', 'failed', 'aborted'].every(
          (key) => Number.isInteger(sample[key]) && sample[key] >= 0,
        ) ||
        sample.count !== sample.completed + sample.failed + sample.aborted ||
        sample.count < 1 ||
        !Number.isFinite(sample.totalMs) ||
        !Number.isFinite(sample.maxMs) ||
        sample.maxMs < 0 ||
        sample.totalMs < sample.maxMs
      )
        errors.push(`invalid phase aggregate:${lane}/${phase}`)
    }
  }
  if (
    !(measurements.foreground.persistence?.count > 0) ||
    (cold && !(measurements.previews.persistence?.count > 0))
  )
    errors.push('persistence evidence missing')
  if (
    measurements.previewAttempts.completed !== (cold ? valid : 0) ||
    measurements.previewAttempts.failed !== 0 ||
    measurements.previewAttempts.aborted !== 0 ||
    report.backgroundPreviews.completedFrames !== (cold ? valid * 9 : 0)
  )
    errors.push('preview output mismatch')
  return errors
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  const count = sorted.length
  return {
    count,
    median: count
      ? (sorted[Math.floor((count - 1) / 2)] + sorted[Math.floor(count / 2)]) /
        2
      : null,
    p95: count ? sorted[Math.ceil(count * 0.95) - 1] : null,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  }
}

export function validateReport(report, cache, expected) {
  const errors = []
  if (report.timing.pipelineCompletedAtMs == null)
    errors.push('pipeline not settled')
  const counts = report.foreground.counts
  const attempts = report.measurements.previewAttempts
  if (
    report.input.selectedCount !== expected.selected ||
    report.input.acceptedCount !== expected.accepted ||
    counts.total !== expected.accepted ||
    counts.completed !== expected.accepted ||
    counts.duplicates !== expected.duplicates ||
    counts.failed + counts.skipped !== expected.invalid
  )
    errors.push('input or classification counts mismatch')
  if (attempts.started !== attempts.settled)
    errors.push('preview attempts not settled')
  if (
    cache === 'cold' &&
    (counts.created !== expected.supported ||
      counts.existing !== 0 ||
      report.backgroundPreviews.counts.ready !== expected.supported ||
      report.backgroundPreviews.counts.failed !== 0 ||
      attempts.started !== expected.supported)
  )
    errors.push('cold processing counts mismatch')
  if (
    cache === 'warm' &&
    (counts.existing !== expected.supported ||
      counts.created !== 0 ||
      counts.retryQueue !== expected.invalid ||
      counts.skipped !== expected.invalid ||
      counts.failed !== 0 ||
      attempts.started !== 0 ||
      Object.keys(report.measurements.previews).length !== 0 ||
      (report.measurements.foreground.metadata?.count ?? 0) !==
        expected.invalid ||
      (report.measurements.foreground.metadata?.failed ?? 0) !==
        expected.invalid ||
      (report.measurements.foreground.metadata?.completed ?? 0) !== 0 ||
      (report.measurements.foreground.metadata?.aborted ?? 0) !== 0 ||
      ['seek', 'capture', 'encode', 'serialize'].some(
        (phase) => (report.measurements.foreground[phase]?.count ?? 0) > 0,
      ))
  )
    errors.push('warm media work or cache counts mismatch')
  return errors
}
