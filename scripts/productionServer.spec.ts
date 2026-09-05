// @vitest-environment node

import { once } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { request, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

type ProductionServerFactory = (options: {
  distRoot: string
  benchmarkEnabled?: boolean
}) => Server

const loadServerFactory = async (): Promise<ProductionServerFactory> => {
  const moduleUrl = new URL('./productionServer.mjs', import.meta.url)
  const module = (await import(moduleUrl.href)) as {
    createProductionServer: ProductionServerFactory
  }
  return module.createProductionServer
}

describe('production static server', () => {
  let temporaryRoot: string
  let distRoot: string
  let server: Server | undefined
  let origin: string

  beforeEach(async () => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'bulk-video-review-production-'))
    distRoot = join(temporaryRoot, 'dist')
    mkdirSync(distRoot)
    mkdirSync(join(distRoot, 'assets'))
    mkdirSync(join(distRoot, 'benchmark'))
    writeFileSync(join(distRoot, 'benchmark/index.html'), '<h1>Benchmark</h1>')
    writeFileSync(join(distRoot, 'benchmark/run.html'), '<h1>Trial</h1>')
    writeFileSync(
      join(distRoot, 'benchmark/build-identity.json'),
      JSON.stringify({
        revision: 'a'.repeat(40),
        assetsSha256: 'b'.repeat(64),
        dirty: false,
      }),
    )
    writeFileSync(join(distRoot, 'index.html'), '<h1>BVR</h1>')
    writeFileSync(join(distRoot, 'assets', 'app.js'), 'console.log("bvr")')
    writeFileSync(join(distRoot, 'favicon.ico'), 'icon')
    writeFileSync(join(temporaryRoot, 'outside.txt'), 'must not be served')

    const createProductionServer = await loadServerFactory()
    server = createProductionServer({ distRoot })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('expected a TCP listener')
    }
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (server?.listening) {
      server.close()
      await once(server, 'close')
    }
    rmSync(temporaryRoot, { recursive: true, force: true })
  })

  const rawRequest = async (
    path: string,
    method = 'GET',
  ): Promise<{
    status: number
    body: string
    headers: Record<string, string | string[] | undefined>
  }> => {
    const url = new URL(origin)
    return new Promise((resolve, reject) => {
      const outgoing = request(
        {
          hostname: url.hostname,
          port: url.port,
          path,
          method,
        },
        (incoming) => {
          let body = ''
          incoming.setEncoding('utf8')
          incoming.on('data', (chunk) => {
            body += chunk
          })
          incoming.on('end', () => {
            resolve({
              status: incoming.statusCode ?? 0,
              body,
              headers: incoming.headers,
            })
          })
        },
      )
      outgoing.on('error', reject)
      outgoing.end()
    })
  }

  test.each(['/health/live', '/health/ready'])(
    'serves successful JSON health at %s',
    async (path) => {
      const response = await fetch(`${origin}${path}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual({ status: 'ok' })
    },
  )

  test('reports not ready when the built SPA entrypoint is unavailable', async () => {
    rmSync(join(distRoot, 'index.html'))

    expect(await rawRequest('/health/live')).toMatchObject({ status: 200 })
    expect(await rawRequest('/health/ready')).toMatchObject({
      status: 503,
      body: '{"status":"not-ready"}',
    })
    expect(await rawRequest('/')).toMatchObject({ status: 503 })
  })

  test('serves the built index and static assets', async () => {
    const index = await rawRequest('/')
    const asset = await rawRequest('/assets/app.js')

    expect(index).toMatchObject({ status: 200, body: '<h1>BVR</h1>' })
    expect(index.headers['content-type']).toContain('text/html')
    expect(asset).toMatchObject({ status: 200, body: 'console.log("bvr")' })
    expect(asset.headers['content-type']).toContain('text/javascript')
    expect(asset.headers['x-content-type-options']).toBe('nosniff')
    expect(asset.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    )
    expect((await rawRequest('/favicon.ico')).headers['cache-control']).toBe(
      'public, max-age=3600',
    )
  })

  test('falls back to the SPA only for extensionless routes', async () => {
    expect(await rawRequest('/review/session')).toMatchObject({
      status: 200,
      body: '<h1>BVR</h1>',
    })
    expect(await rawRequest('/assets/missing.js')).toMatchObject({
      status: 404,
    })
  })

  test('rejects encoded traversal outside the distribution root', async () => {
    expect(await rawRequest('/%2e%2e%2foutside.txt')).toMatchObject({
      status: 404,
    })
  })

  test('supports HEAD without a response body', async () => {
    expect(await rawRequest('/assets/app.js', 'HEAD')).toMatchObject({
      status: 200,
      body: '',
    })
  })

  test('rejects methods that cannot serve static content', async () => {
    const response = await rawRequest('/', 'POST')

    expect(response.status).toBe(405)
    expect(response.headers.allow).toBe('GET, HEAD')
  })

  test.each([
    '/benchmark',
    '/benchmark/',
    '/benchmark/index.html',
    '/benchmark/run.html',
    '/benchmark/capabilities',
    '/benchmark/build-identity.json',
    '/benchmark/unknown',
    '/benchmark/x/../index.html',
  ])(
    'reserves %s with default-off GET and HEAD instead of SPA fallback',
    async (path) => {
      expect((await rawRequest(path)).status).toBe(404)
      expect((await rawRequest(path, 'HEAD')).status).toBe(404)
    },
  )

  test('explicit enablement serves only known entries and no-store capabilities', async () => {
    server!.close()
    await once(server!, 'close')
    server = (await loadServerFactory())({ distRoot, benchmarkEnabled: true })
    server.listen(Number(new URL(origin).port), '127.0.0.1')
    await once(server, 'listening')
    for (const path of [
      '/benchmark',
      '/benchmark/',
      '/benchmark/index.html',
      '/benchmark/run.html',
    ]) {
      const response = await rawRequest(path)
      expect(response.status).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['content-type']).toContain('text/html')
    }
    const capability = await rawRequest('/benchmark/capabilities')
    expect(JSON.parse(capability.body)).toMatchObject({
      enabled: true,
      protocolVersion: 2,
      build: { assetsSha256: 'b'.repeat(64) },
    })
    expect(capability.headers['cache-control']).toBe('no-store')
    for (const path of [
      '/benchmark/unknown',
      '/benchmark/x/../index.html',
      '/benchmark/%2e%2e%2findex.html',
    ])
      expect((await rawRequest(path)).status).toBe(404)
    expect((await rawRequest('/benchmark/%ZZ')).status).toBe(400)
    expect((await rawRequest('/')).body).toBe('<h1>BVR</h1>')
  })
})
