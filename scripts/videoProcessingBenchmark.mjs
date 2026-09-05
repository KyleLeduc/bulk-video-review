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
import {
  validateTerminalReport,
  validateMeasurements,
  summarize,
  validateReport,
  validatePipelineSuite,
} from '../src/shared/benchmark/videoBenchmarkProtocol.js'
export {
  validateTerminalReport,
  validateMeasurements,
  summarize,
  validateReport,
}

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
  const view = options.view ?? 'gallery'
  if (!['gallery', 'pipeline'].includes(view))
    throw new Error('Unsupported view')
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
  if (
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > (view === 'pipeline' ? 5 : 20)
  )
    throw new Error('Invalid repetitions')
  return { ...options, repetitions, view }
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

function startMemorySampling(browserProtocol) {
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
  return { memory, stopMemory }
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
  const { memory, stopMemory } = startMemorySampling(browserProtocol)
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

export async function verifyCorpusFiles(files, expected) {
  for (let index = 0; index < files.length; index++) {
    if ((await stat(files[index])).size !== expected[index].bytes)
      throw new Error(`Corpus size mismatch at index ${index}`)
    if ((await hashFile(files[index])) !== expected[index].sha256)
      throw new Error(`Corpus hash mismatch at index ${index}`)
  }
}

export function validatePipelineRunnerSettings(settings, repetitions) {
  const configuration = settings?.configurations?.[0]
  return settings?.repetitions === repetitions &&
    settings.includeCached === true &&
    settings.configurations.length === 1 &&
    configuration.backend === 'dom' &&
    configuration.foreground === 2 &&
    configuration.previews === 1
    ? []
    : ['Page settings differ from requested DOM 2/1 fresh/cached pairs']
}

async function runtimeResources() {
  const sharedMemory = await statfs('/dev/shm')
  return {
    cpuMax: (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(),
    memoryMax: (await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim(),
    shmBytes: sharedMemory.bsize * sharedMemory.blocks,
  }
}

export async function verifyServedBuild(root, url, includeBenchmark = false) {
  const entries = []
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (!includeBenchmark && directory === root && entry.name === 'benchmark')
        continue
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

async function runPipelinePage(options, manifest, files) {
  const reference = JSON.parse(
    await readFile(
      new URL(
        '../src/shared/benchmark/referenceFixtures.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  if (
    manifest.id !== reference.id ||
    JSON.stringify(manifest.files) !== JSON.stringify(reference.files) ||
    JSON.stringify(manifest.expected) !== JSON.stringify(reference.expected)
  )
    throw new Error('Pipeline view requires the fixed reference manifest')
  const buildSha256 = await verifyServedBuild(
    resolve('dist'),
    options.url,
    true,
  )
  const capabilityResponse = await fetch(
    new URL('/benchmark/capabilities', options.url),
    { signal: AbortSignal.timeout(10000), redirect: 'error' },
  )
  const capability = capabilityResponse.ok
    ? await capabilityResponse.json()
    : null
  if (capability?.enabled !== true || capability.protocolVersion !== 2)
    throw new Error('Pipeline view is not enabled')
  if (options.revision && capability.build.revision !== options.revision)
    throw new Error('Requested revision does not match served benchmark build')
  const runnerSha256 = await hashFile(fileURLToPath(import.meta.url))
  const resources = await runtimeResources()
  const output = await open(options.output, 'wx', 0o600)
  const controller = new AbortController()
  let session
  let stopMemory
  const runner = {
    mode: options.pilot ? 'pilot' : 'measured',
    browser: options.browser,
    browserVersion: null,
    buildSha256,
    resources,
    node: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    viewport: { width: 1440, height: 1000 },
    orderProtocol: 'page-owned-rotating-pairs-v1',
    appUrl: options.url,
    runnerSha256,
    corpusFiles: reference.files.map(({ path, sha256, bytes }) => ({
      path,
      sha256,
      bytes,
    })),
    verification:
      'streaming SHA-256 and file sizes verified before browser launch',
    memory: null,
    sampleErrors: [],
    memoryLimitations:
      'Separate whole-browser sampled summed RSS; shared pages may be counted more than once. Not isolated decoder memory or per-trial latency.',
  }
  let result = {
    protocolVersion: 2,
    mode: 'pipeline-no-gallery-v1',
    status: 'failed',
    cleanup: 'failed',
    rows: [],
    errors: [],
    runner,
    fixture: { id: reference.id, verification: 'sha256-verified' },
    identity: { build: capability.build },
  }
  const shutdown = installShutdown(process, controller, () => session?.close())
  try {
    session = await launch(options.browser, controller.signal)
    const { page, browserProtocol } = session
    const browserVersion = await browserProtocol.send('Browser.getVersion')
    runner.browserVersion = browserVersion
    await page.send('Page.navigate', {
      url: new URL('/benchmark/', options.url).href,
    })
    await waitFor(
      () =>
        evaluate(page, () =>
          Boolean(document.querySelector('[data-test=start]')),
        ),
      'benchmark controls',
    )
    await evaluate(
      page,
      (repetitions) => {
        for (const [name, value] of [
          ['foreground', '2'],
          ['previews', '1'],
        ]) {
          const select = document.querySelector(`[data-test=${name}]`)
          select.value = value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const cached = document.querySelector('[data-test=cached]')
        cached.checked = true
        cached.dispatchEvent(new Event('change', { bubbles: true }))
        const input = document.querySelector('[data-test=repetitions]')
        input.value = String(repetitions)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        // CDP selects exact manifest paths; avoid directory enumeration/copies.
        document
          .querySelector('[data-test=fixture-files]')
          .removeAttribute('webkitdirectory')
      },
      options.pilot ? 1 : options.repetitions,
    )
    const { root } = await page.send('DOM.getDocument')
    const { nodeId } = await page.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-test=fixture-files]',
    })
    await page.send('DOM.setFileInputFiles', { nodeId, files })
    await waitFor(
      () =>
        evaluate(
          page,
          () => !document.querySelector('[data-test=start]').disabled,
        ),
      'fixed fixture preflight',
    )
    const sampling = startMemorySampling(browserProtocol)
    runner.memory = sampling.memory
    stopMemory = sampling.stopMemory
    await evaluate(page, () =>
      document.querySelector('[data-test=start]').click(),
    )
    const saved = await waitFor(
      async () => {
        controller.signal.throwIfAborted()
        const snapshot = await evaluate(
          page,
          (knownRows) => {
            const json = document.querySelector(
              '[data-test=result-json]',
            )?.value
            const state = document.querySelector(
              '[data-test=suite-status]',
            )?.textContent
            if (state?.startsWith('failed') && !json)
              throw new Error(
                document.querySelector('[role=alert]')?.textContent ??
                  'Page failed',
              )
            const progress = document.querySelector('[data-test=progress-json]')
            return {
              rows:
                Number(progress?.dataset.rowCount) > knownRows
                  ? progress.value
                  : null,
              settled:
                state && !state.startsWith('running') && json ? json : null,
            }
          },
          result.rows.length,
        )
        if (snapshot.rows) result.rows = JSON.parse(snapshot.rows)
        return snapshot.settled ? JSON.parse(snapshot.settled) : null
      },
      'page suite settlement',
      (options.pilot ? 1 : options.repetitions) * 2 * 145000 + 30000,
    )
    result = { ...saved, runner }
    const sampleErrors = await stopMemory()
    stopMemory = null
    runner.sampleErrors = sampleErrors
    result.fixture.verification = 'sha256-verified'
    const errors = validatePipelineSuite(result, reference)
    errors.push(
      ...validatePipelineRunnerSettings(
        result.settings,
        options.pilot ? 1 : options.repetitions,
      ),
    )
    if (
      JSON.stringify(result.identity.build) !== JSON.stringify(capability.build)
    )
      errors.push('Page/build identity mismatch')
    if (
      !(
        options.browser === 'edge'
          ? /^Edg\/\d+\.\d+\.\d+\.\d+$/
          : /^Chrome\/\d+\.\d+\.\d+\.\d+$/
      ).test(browserVersion.product) ||
      result.identity.userAgent !== browserVersion.userAgent ||
      (options.browser === 'edge') !==
        result.identity.userAgent.includes('Edg/')
    )
      errors.push('Browser product mismatch')
    if (sampleErrors.length) errors.push('Browser process sampling failed')
    if (errors.length) {
      result.status = 'failed'
      result.errors.push(...errors)
      throw new Error('Invalid page suite; evidence retained')
    }
    console.log(
      `${options.browser} pipeline: ${result.rows.length} complete fresh/cached rows`,
    )
  } catch (error) {
    result.status = 'failed'
    result.errors.push(error.message)
    throw error
  } finally {
    shutdown.dispose()
    try {
      try {
        if (stopMemory) await stopMemory()
      } finally {
        try {
          await shutdown.settled()
        } finally {
          await session?.close()
        }
      }
    } catch (error) {
      result.cleanup = 'failed'
      result.errors.push(error.message)
      process.exitCode = 1
    } finally {
      await output.write(JSON.stringify(result, null, 2))
      await output.sync()
      await output.close()
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      browser: { type: 'string' },
      view: { type: 'string', default: 'gallery' },
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
  await verifyCorpusFiles(files, manifest.files)
  if (options.view === 'pipeline')
    return runPipelinePage(options, manifest, files)
  const expected = {
    ...manifest.expected,
    acceptedBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  }
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
    resources: await runtimeResources(),
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
