/* eslint-env node, browser */
/* global globalThis */
import { createReadStream } from 'node:fs'
import {
  realpath,
  stat,
  statfs,
  readFile,
  readdir,
  open,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import { resolve, sep, join, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { tmpdir, platform, arch, release } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'

const browsers = {
  chrome: '/usr/bin/google-chrome',
  edge: '/usr/bin/microsoft-edge',
}

export function validateEvidenceSet(rows, repetitions = 5) {
  const errors = validateMatrix(rows, [
    ...enumerateCases('chrome', repetitions),
    ...enumerateCases('edge', repetitions),
  ])
  const common = (identity) =>
    JSON.stringify(
      [
        'corpusId',
        'corpusManifestSha256',
        'buildSha256',
        'runnerSha256',
        'probeSha256',
        'declaredAppRevision',
        'resources',
        'viewport',
        'orderProtocol',
        'appUrl',
        'node',
        'os',
        'cacheScope',
      ].map((key) => identity?.[key]),
    )
  const baseline = common(rows[0]?.identity)
  const browserVersions = new Map()
  for (const row of rows) {
    const key = caseKey(row.configuration)
    if (row.identity?.mode !== 'measured') errors.push(`not measured:${key}`)
    if (common(row.identity) !== baseline)
      errors.push(`identity mismatch:${key}`)
    if (
      ![
        'corpusManifestSha256',
        'buildSha256',
        'runnerSha256',
        'probeSha256',
      ].every((name) => /^[a-f0-9]{64}$/.test(row.identity?.[name] ?? '')) ||
      !/^[a-f0-9]{40}$/.test(row.identity?.declaredAppRevision ?? '') ||
      !Number.isSafeInteger(row.identity?.resources?.shmBytes) ||
      row.identity.resources.shmBytes <= 0
    )
      errors.push(`invalid identity:${key}`)
    const version = JSON.stringify(row.identity?.browserVersion)
    const expectedProduct =
      row.configuration.browser === 'chrome'
        ? /^Chrome\/\d+\.\d+\.\d+\.\d+$/
        : /^Edg\/\d+\.\d+\.\d+\.\d+$/
    if (!expectedProduct.test(row.identity?.browserVersion?.product ?? ''))
      errors.push(`browser product mismatch:${key}`)
    if (
      !version ||
      (browserVersions.has(row.configuration.browser) &&
        browserVersions.get(row.configuration.browser) !== version)
    )
      errors.push(`browser version mismatch:${key}`)
    browserVersions.set(row.configuration.browser, version)
  }
  return errors
}

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

export function installShutdown(signals, controller, close) {
  let pending = Promise.resolve()
  const onSignal = () => {
    if (controller.signal.aborted) return
    controller.abort(new Error('Benchmark interrupted'))
    try {
      pending = Promise.resolve(close())
    } catch (error) {
      pending = Promise.reject(error)
    }
    // Keep rejection handled until the owner awaits cleanup in its finally.
    pending.catch(() => {})
  }
  signals.on('SIGINT', onSignal)
  signals.on('SIGTERM', onSignal)
  return {
    settled: () => pending,
    dispose() {
      signals.removeListener('SIGINT', onSignal)
      signals.removeListener('SIGTERM', onSignal)
    },
  }
}

export function qualifyObservations(report, interactions, memory) {
  const start = report.timing.foregroundStartedAtMs
  const end = report.timing.pipelineCompletedAtMs
  const keydowns = interactions.trustedKeydowns.filter((sample) => {
    const at = interactions.timeOrigin + sample.eventAtMs
    return (
      at >= start &&
      at <= end &&
      Number.isFinite(sample.nextFrameOpportunityMs) &&
      at + sample.nextFrameOpportunityMs <= end
    )
  })
  const rss = memory.samples.filter(
    (sample) => sample.startedAtMs >= start && sample.atMs <= end,
  )
  return {
    window: { startedAtMs: start, completedAtMs: end },
    availability: {
      interactions: keydowns.length ? 'observed' : 'unavailable',
      memory: rss.length ? 'observed' : 'unavailable',
    },
    handlerDelayMs: summarize(keydowns.map((sample) => sample.handlerDelayMs)),
    nextFrameOpportunityMs: summarize(
      keydowns.map((sample) => sample.nextFrameOpportunityMs),
    ),
    browserProcessRssKiB: summarize(rss.map((sample) => sample.totalRssKiB)),
    limitations:
      'Caret-key handler/frame opportunities are not full interaction-to-paint latency. Summed sampled process RSS double-counts shared pages and is not isolated decoder memory. Missing workload samples are unavailable, not zero.',
  }
}

export function validateOptions(options) {
  if (!Object.hasOwn(browsers, options.browser))
    throw new Error('Unsupported browser')
  for (const name of ['corpus', 'output'])
    if (typeof options[name] !== 'string' || !isAbsolute(options[name]))
      throw new Error(`Explicit absolute ${name} required`)
  const url = new URL(options.url)
  if (
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('App URL must use loopback')
  const repetitions = Number(options.repetitions ?? 5)
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20)
    throw new Error('Invalid repetitions')
  return { ...options, repetitions }
}

export function isTerminalToast(toast, cache, supported) {
  if (cache === 'warm') return /^Complete · \d+ \/ \d+$/.test(toast.headline)
  const generated = toast.headline.match(/^Generated (\d+) \/ (\d+)$/)
  const failed = toast.stats.match(/Failed (\d+)/)
  return (
    toast.eyebrow === 'Background previews' &&
    generated !== null &&
    failed !== null &&
    Number(generated[2]) === supported &&
    Number(generated[1]) + Number(failed[1]) === supported &&
    /Pending 0(?:\D|$)/.test(toast.stats)
  )
}

export function enumerateCases(browser, repetitions = 5) {
  if (
    !['chrome', 'edge'].includes(browser) ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 20
  )
    throw new Error('Expected chrome/edge and 1–20 repetitions')
  const cases = []
  const configurations = [1, 2, 4].flatMap((foreground) =>
    [1, 2].map((previews) => ({ foreground, previews })),
  )
  for (let repetition = 1; repetition <= repetitions; repetition++)
    for (let index = 0; index < configurations.length; index++) {
      const { foreground, previews } =
        configurations[(index + repetition - 1) % configurations.length]
      for (const cache of ['cold', 'warm'])
        cases.push({ browser, foreground, previews, repetition, cache })
    }
  return cases
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

const caseKey = ({ browser, foreground, previews, repetition, cache }) =>
  [browser, foreground, previews, repetition, cache].join('/')

export function validateMatrix(rows, cases) {
  const expected = new Set(cases.map(caseKey))
  const seen = new Set()
  const errors = []
  for (const row of rows) {
    const key = caseKey(row.configuration)
    if (!expected.has(key)) errors.push(`unexpected:${key}`)
    if (seen.has(key)) errors.push(`duplicate:${key}`)
    if (row.status !== 'passed') errors.push(`failed:${key}`)
    seen.add(key)
  }
  for (const key of expected) if (!seen.has(key)) errors.push(`missing:${key}`)
  return errors
}

export async function resolveCorpusPaths(root, paths) {
  const base = await realpath(root)
  return Promise.all(
    paths.map(async (path) => {
      const file = await realpath(resolve(base, path))
      if (file !== base && !file.startsWith(`${base}${sep}`))
        throw new Error('File outside corpus')
      if (!(await stat(file)).isFile()) throw new Error('Expected regular file')
      return file
    }),
  )
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

export function createProtocol(socket, timeoutMs = 30000) {
  let nextId = 0
  const pending = new Map()
  const settle = (id, error, result) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    clearTimeout(request.timer)
    if (error) request.reject(error)
    else request.resolve(result)
  }
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    settle(
      message.id,
      message.error ? new Error(message.error.message) : null,
      message.result,
    )
  })
  const closed = () => {
    for (const id of pending.keys())
      settle(id, new Error('Browser protocol closed'))
  }
  socket.addEventListener('close', closed)
  socket.addEventListener('error', closed)
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== 1)
          return reject(new Error('Browser protocol closed'))
        const id = ++nextId
        const timer = setTimeout(
          () => settle(id, new Error(`${method} timed out`)),
          timeoutMs,
        )
        pending.set(id, { resolve, reject, timer })
        try {
          socket.send(JSON.stringify({ id, method, params }))
        } catch (error) {
          settle(id, error)
        }
      })
    },
    close() {
      socket.close()
      closed()
    },
  }
}

async function connect(url) {
  const socket = new globalThis.WebSocket(url)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('Browser connection timed out'))
    }, 10000)
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer)
        reject(new Error('Browser connection failed'))
      },
      { once: true },
    )
  })
  return createProtocol(socket)
}

async function waitFor(check, description, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  do {
    const value = await check()
    if (value) return value
    await delay(100)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${description}`)
}

async function evaluate(protocol, fn, ...args) {
  const response = await protocol.send('Runtime.evaluate', {
    expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (response.exceptionDetails)
    throw new Error(
      response.exceptionDetails.exception?.description ??
        'Page evaluation failed',
    )
  return response.result.value
}

async function launch(browser, signal) {
  signal?.throwIfAborted()
  const profile = await mkdtemp(join(tmpdir(), 'bvr-reference-profile-'))
  const child = spawn(
    browsers[browser],
    [
      '--headless=new',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--window-size=1440,1000',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stderr = ''
  let spawnError = null
  child.stderr.on('data', (data) => {
    stderr = (stderr + data.toString()).slice(-16384)
  })
  child.on('error', (error) => {
    spawnError = error
  })
  let exited = false
  const exit = new Promise((resolve) => {
    child.once('exit', () => {
      exited = true
      resolve()
    })
    child.once('error', () => {
      exited = true
      resolve()
    })
  })
  let browserProtocol
  let page
  let closing
  const close = () =>
    (closing ??= (async () => {
      if (browserProtocol && !exited) {
        // Ask Chromium to flush its profile before terminating its parent.
        const graceful = browserProtocol
          .send('Browser.close')
          .catch((error) => {
            if (error.message !== 'Browser protocol closed')
              console.warn('Graceful browser close failed:', error.message)
          })
        await Promise.race([graceful, exit, delay(1500)])
      }
      page?.close()
      await Promise.race([exit, delay(1500)])
      if (!exited) {
        child.kill('SIGTERM')
        await Promise.race([exit, delay(3000)])
      }
      if (!exited) {
        child.kill('SIGKILL')
        await exit
      }
      browserProtocol?.close()
      // Only this invocation's freshly created profile, after its process exits.
      // Descendant network/profile writers can finish just after parent exit.
      // Retry transient ENOTEMPTY/EBUSY only within this disposable profile.
      await rm(profile, { recursive: true, maxRetries: 10, retryDelay: 100 })
    })())
  try {
    const portFile = await waitFor(async () => {
      signal?.throwIfAborted()
      if (spawnError || exited)
        throw spawnError ?? new Error(`Browser exited: ${stderr}`)
      try {
        return await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
    }, 'browser startup')
    const [port, path] = portFile.trim().split('\n')
    browserProtocol = await connect(`ws://127.0.0.1:${port}${path}`)
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(10000),
    })
    const target = (await response.json()).find((item) => item.type === 'page')
    if (!target) throw new Error('No browser page')
    page = await connect(target.webSocketDebuggerUrl)
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    })
    return { page, browserProtocol, close }
  } catch (error) {
    await close()
    throw error
  }
}

// Injected only in the disposable benchmark page; never bundled into the app.
function installInteractions() {
  const result = {
    timeOrigin: performance.timeOrigin,
    trustedKeydowns: [],
    eventTiming: {
      supported: PerformanceObserver.supportedEntryTypes.includes('event'),
      durationThresholdMs: 16,
      entries: [],
    },
  }
  let active = false
  const start = () => {
    active = true
  }
  document.addEventListener('change', start, { capture: true, once: true })
  const keydown = (event) => {
    if (!active || !event.isTrusted || result.trustedKeydowns.length >= 1000)
      return
    const sample = {
      eventAtMs: event.timeStamp,
      handlerDelayMs: Math.max(0, performance.now() - event.timeStamp),
      nextFrameOpportunityMs: null,
    }
    result.trustedKeydowns.push(sample)
    requestAnimationFrame(() => {
      sample.nextFrameOpportunityMs = Math.max(
        0,
        performance.now() - event.timeStamp,
      )
    })
  }
  document.addEventListener('keydown', keydown, true)
  const consume = (entries) => {
    for (const entry of entries)
      if (
        active &&
        entry.name === 'keydown' &&
        result.eventTiming.entries.length < 1000
      )
        result.eventTiming.entries.push({
          startTime: entry.startTime,
          duration: entry.duration,
          interactionId: entry.interactionId,
        })
  }
  const observer = result.eventTiming.supported
    ? new PerformanceObserver((list) => consume(list.getEntries()))
    : null
  observer?.observe({ type: 'event', durationThreshold: 16 })
  window.bvrBenchmarkInteractions = {
    stop() {
      if (observer) {
        consume(observer.takeRecords())
        observer.disconnect()
      }
      active = false
      document.removeEventListener('change', start, true)
      document.removeEventListener('keydown', keydown, true)
      return result
    },
  }
}

function periodic(operation, intervalMs) {
  let pending = null
  const errors = []
  const tick = () => {
    if (pending) return
    pending = operation()
      .catch((error) => errors.push(error.message))
      .finally(() => {
        pending = null
      })
  }
  const timer = setInterval(tick, intervalMs)
  tick()
  return async () => {
    clearInterval(timer)
    await pending
    return errors
  }
}

async function measureRun(
  session,
  configuration,
  files,
  expected,
  url,
  probeSource,
) {
  const { page, browserProtocol } = session
  await page.send('Page.navigate', { url })
  await waitFor(
    () =>
      evaluate(page, () =>
        document
          .querySelector('h1')
          ?.textContent?.includes('bulk-video-review'),
      ),
    'app ready',
  )
  await evaluate(page, () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Diagnostics')
      .click(),
  )
  await waitFor(
    () =>
      evaluate(page, () =>
        Boolean(document.querySelector('#ingestionConcurrency')),
      ),
    'diagnostics',
  )
  await evaluate(
    page,
    (configuration) => {
      for (const [id, value] of [
        ['ingestionConcurrency', configuration.foreground],
        ['thumbnailConcurrency', configuration.previews],
      ]) {
        const select = document.getElementById(id)
        select.value = String(value)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
      document.querySelector('.panel > nav button').click()
      document.getElementById('video-filter-search').focus()
      window.scrollTo(0, 0)
    },
    configuration,
  )
  if (await evaluate(page, () => document.querySelectorAll('.card').length))
    throw new Error('Gallery is not empty before selection')
  const installed = await page.send('Runtime.evaluate', {
    expression: probeSource,
  })
  if (installed.exceptionDetails) throw new Error('Probe installation failed')
  await evaluate(page, installInteractions)
  await evaluate(page, () => window.bvrVideoProbe.arm())
  const { root } = await page.send('DOM.getDocument')
  const { nodeId } = await page.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[data-picker-mode="files"]',
  })
  const memory = { intervalMs: 500, samples: [], missedProcesses: 0 }
  const stopMemory = periodic(async () => {
    const startedAtMs = Date.now()
    const { processInfo } = await browserProtocol.send(
      'SystemInfo.getProcessInfo',
    )
    let totalRssKiB = 0
    let processCount = 0
    for (const process of processInfo) {
      if (!Number.isInteger(process.id) || process.id <= 0)
        throw new Error('Invalid browser process identity')
      try {
        const status = await readFile(`/proc/${process.id}/status`, 'utf8')
        const rss = status.match(/^VmRSS:\s+(\d+) kB$/m)
        if (rss) {
          totalRssKiB += Number(rss[1])
          processCount++
        }
      } catch (error) {
        if (error.code === 'ENOENT') memory.missedProcesses++
        else throw error
      }
    }
    memory.samples.push({
      startedAtMs,
      atMs: Date.now(),
      totalRssKiB,
      processCount,
    })
  }, memory.intervalMs)
  let inputCount = 0
  const stopInputs = periodic(async () => {
    const key = inputCount++ % 2 === 0 ? 'ArrowLeft' : 'ArrowRight'
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode: key === 'ArrowLeft' ? 37 : 39,
      timestamp: Date.now() / 1000,
    })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key })
  }, 300)
  let runError = null
  let lastToast = null
  try {
    await page.send('DOM.setFileInputFiles', { nodeId, files })
    await waitFor(
      async () => {
        lastToast = await evaluate(page, () => ({
          headline:
            document.querySelector('.ingestion-toast h2')?.textContent.trim() ??
            '',
          eyebrow:
            document
              .querySelector('.ingestion-toast .eyebrow')
              ?.textContent.trim() ?? '',
          stats:
            document
              .querySelector('.ingestion-toast__stats')
              ?.textContent.replace(/\s+/g, ' ')
              .trim() ?? '',
        }))
        return isTerminalToast(
          lastToast,
          configuration.cache,
          expected.supported,
        )
      },
      'settled visible pipeline',
      180000,
    )
  } catch (error) {
    runError = error.message
  }
  const inputErrors = await stopInputs()
  const memoryErrors = await stopMemory()
  const observations = await evaluate(page, () => ({
    ui: window.bvrVideoProbe.stop(),
    interactions: window.bvrBenchmarkInteractions.stop(),
  }))
  await evaluate(page, () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Diagnostics')
      .click(),
  )
  const report = await waitFor(
    () =>
      evaluate(page, () => {
        const field = document.querySelector(
          '[data-testid="ingestion-report-json"]',
        )
        return field?.value ? JSON.parse(field.value) : null
      }),
    'run report',
  )
  const errors = [...inputErrors, ...memoryErrors]
  let qualifiedObservations = null
  try {
    errors.push(
      ...validateReport(report, configuration.cache, expected),
      ...validateMeasurements(report, configuration, expected),
      ...validateTerminalReport(report, configuration.cache, expected),
    )
    qualifiedObservations = qualifyObservations(
      report,
      observations.interactions,
      memory,
    )
  } catch (error) {
    // Retain the fetched raw report/probe/memory even if a malformed schema throws.
    errors.push(`Evidence validation failed: ${error.message}`)
  }
  if (runError) errors.push(runError)
  if (
    !observations.ui ||
    observations.ui.hiddenDuringRun ||
    observations.ui.firstVisibleThumbnailMs == null
  )
    errors.push('UI probe invalid')
  if (
    !memory.samples.length ||
    memory.samples.some((sample) => sample.totalRssKiB <= 0)
  )
    errors.push('Process RSS unavailable')
  return {
    status: errors.length ? 'failed' : 'passed',
    statusScope:
      'Pipeline, corpus counts and probe validity only; inspect sample availability separately. Native interaction/decoder-memory acceptance remains open.',
    errors,
    report,
    ...observations,
    memory,
    qualifiedObservations,
    lastToast,
  }
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyServedBuild(root, url) {
  const entries = []
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        const relative = path.slice(root.length + 1)
        const localHash = await hashFile(path)
        const size = (await stat(path)).size
        const response = await fetch(
          new URL(relative.split('/').map(encodeURIComponent).join('/'), url),
          { redirect: 'error', signal: AbortSignal.timeout(10000) },
        )
        if (!response.ok) throw new Error(`Served build mismatch: ${relative}`)
        const remoteHash = createHash('sha256')
        let bytes = 0
        for await (const chunk of response.body) {
          bytes += chunk.length
          if (bytes > size)
            throw new Error(`Served build mismatch: ${relative}`)
          remoteHash.update(chunk)
        }
        if (bytes !== size || remoteHash.digest('hex') !== localHash)
          throw new Error(`Served build mismatch: ${relative}`)
        entries.push([relative, localHash])
      } else throw new Error('Unexpected build entry')
    }
  }
  await walk(root)
  return createHash('sha256')
    .update(JSON.stringify(entries.sort()))
    .digest('hex')
}

async function main() {
  const { values } = parseArgs({
    options: {
      browser: { type: 'string' },
      corpus: { type: 'string' },
      output: { type: 'string' },
      url: { type: 'string', default: 'http://127.0.0.1:4173' },
      repetitions: { type: 'string', default: '5' },
      pilot: { type: 'boolean', default: false },
      revision: { type: 'string' },
    },
  })
  const options = validateOptions(values)
  const manifestText = await readFile(
    join(options.corpus, 'manifest.json'),
    'utf8',
  )
  const manifest = JSON.parse(manifestText)
  const files = await resolveCorpusPaths(
    options.corpus,
    manifest.files.map((file) => file.path),
  )
  for (let index = 0; index < files.length; index++) {
    if ((await hashFile(files[index])) !== manifest.files[index].sha256)
      throw new Error(`Corpus hash mismatch at index ${index}`)
  }
  const expected = {
    ...manifest.expected,
    acceptedBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  }
  const sharedMemory = await statfs('/dev/shm')
  const identity = {
    corpusId: manifest.id,
    corpusManifestSha256: createHash('sha256')
      .update(manifestText)
      .digest('hex'),
    buildSha256: await verifyServedBuild(resolve('dist'), options.url),
    declaredAppRevision: options.revision ?? null,
    runnerSha256: await hashFile(fileURLToPath(import.meta.url)),
    probeSha256: await hashFile(
      fileURLToPath(new URL('./videoProcessingProbe.js', import.meta.url)),
    ),
    appUrl: options.url,
    resources: {
      cpuMax: (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(),
      memoryMax: (await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim(),
      shmBytes: sharedMemory.bsize * sharedMemory.blocks,
    },
    node: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    mode: options.pilot ? 'pilot' : 'measured',
    orderProtocol: 'rotating-configurations-v1',
    cacheScope:
      'fresh browser profile for cold; same-profile reload for warm; OS cache not reset',
    viewport: { width: 1440, height: 1000 },
  }
  const probeSource = await readFile(
    new URL('./videoProcessingProbe.js', import.meta.url),
    'utf8',
  )
  const allCases = enumerateCases(options.browser, options.repetitions)
  const cases = options.pilot ? allCases.slice(0, 2) : allCases
  // Exclusive creation also rejects existing files and symlinks. Never overwrite evidence.
  const output = await open(options.output, 'wx', 0o600)
  const rows = []
  let session
  const controller = new AbortController()
  const shutdown = installShutdown(process, controller, () => session?.close())
  try {
    for (const configuration of cases) {
      controller.signal.throwIfAborted()
      let row
      try {
        if (configuration.cache === 'cold')
          session = await launch(options.browser, controller.signal)
        controller.signal.throwIfAborted()
        const browserVersion =
          await session.browserProtocol.send('Browser.getVersion')
        row = {
          configuration,
          identity: { ...identity, browserVersion },
          startedAt: new Date().toISOString(),
          ...(await measureRun(
            session,
            configuration,
            files,
            expected,
            options.url,
            probeSource,
          )),
        }
      } catch (error) {
        row = {
          configuration,
          identity,
          status: 'failed',
          errors: [error.message],
        }
      }
      rows.push(row)
      await output.write(`${JSON.stringify(row)}\n`)
      await output.sync()
      console.log(
        `${caseKey(configuration)} ${row.status} pipelineMs=${row.report?.timing.pipelineElapsedMs ?? 'unavailable'}`,
      )
      if (row.status !== 'passed')
        throw new Error(`Failed run retained: ${row.errors.join('; ')}`)
      if (configuration.cache === 'warm') {
        await session.close()
        session = null
      }
    }
    const errors = validateMatrix(rows, cases)
    if (errors.length) throw new Error(errors.join('; '))
  } finally {
    shutdown.dispose()
    try {
      await shutdown.settled()
      await session?.close()
    } finally {
      await output.close()
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
