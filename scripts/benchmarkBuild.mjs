import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

export function fingerprintAssets(assets) {
  const hash = createHash('sha256')
  for (const [name, content] of [...assets]
    .filter(([name]) => name !== 'benchmark/build-identity.json')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash
      .update(name)
      .update('\0')
      .update(createHash('sha256').update(content).digest())
      .update('\0')
  }
  return hash.digest('hex')
}

function sourceIdentity() {
  if (/^[a-f0-9]{40}$/.test(process.env.BVR_BUILD_REVISION ?? ''))
    return {
      revision: process.env.BVR_BUILD_REVISION,
      dirty: null,
      source: 'build-argument',
    }
  try {
    const git = (args) =>
      execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    return {
      revision: git(['rev-parse', 'HEAD']),
      dirty: git(['status', '--porcelain']).length > 0,
      source: 'local-git',
    }
  } catch {
    return { revision: null, dirty: null, source: 'unknown' }
  }
}

export function benchmarkBuildPlugin() {
  return {
    name: 'bvr-benchmark-entry',
    generateBundle(_options, bundle) {
      const assets = Object.entries(bundle).map(([name, output]) => [
        name,
        output.type === 'chunk' ? output.code : output.source,
      ])
      this.emitFile({
        type: 'asset',
        fileName: 'benchmark/build-identity.json',
        source: JSON.stringify({
          ...sourceIdentity(),
          assetsSha256: fingerprintAssets(assets),
        }),
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let path
        try {
          path = decodeURIComponent((request.url ?? '/').split('?')[0])
        } catch {
          response.statusCode = 400
          response.end()
          return
        }
        if (path !== '/benchmark' && !path.startsWith('/benchmark/'))
          return next()
        response.setHeader('Cache-Control', 'no-store')
        if (
          process.env.BVR_BENCHMARK_ENABLED !== 'true' ||
          ![
            '/benchmark',
            '/benchmark/',
            '/benchmark/index.html',
            '/benchmark/run.html',
            '/benchmark/capabilities',
          ].includes(path)
        ) {
          response.statusCode = 404
          response.end('Benchmark unavailable')
          return
        }
        if (path === '/benchmark/capabilities') {
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              enabled: true,
              protocolVersion: 2,
              build: {
                ...sourceIdentity(),
                assetsSha256: null,
                source: 'dev-unqualified',
              },
            }),
          )
          return
        }
        if (path === '/benchmark') request.url = '/benchmark/'
        next()
      })
    },
  }
}
