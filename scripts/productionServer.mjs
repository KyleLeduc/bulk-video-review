import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

const sendJson = (request, response, status, body, extraHeaders = {}) => {
  const content = JSON.stringify(body)
  response.writeHead(status, {
    ...jsonHeaders,
    'Content-Length': Buffer.byteLength(content),
    ...extraHeaders,
  })
  response.end(request.method === 'HEAD' ? undefined : content)
}

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return false
    }
    throw error
  }
}

export const createProductionServer = ({
  distRoot,
  benchmarkEnabled = false,
}) => {
  if (typeof distRoot !== 'string' || distRoot.length === 0) {
    throw new TypeError('distRoot must be a non-empty string')
  }

  const resolvedDistRoot = resolve(distRoot)
  const indexPath = resolve(resolvedDistRoot, 'index.html')

  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(
        request,
        response,
        405,
        { status: 'method-not-allowed' },
        {
          Allow: 'GET, HEAD',
        },
      )
      return
    }

    if (request.url === '/health/live') {
      sendJson(request, response, 200, { status: 'ok' })
      return
    }

    if (request.url === '/health/ready') {
      try {
        if (await isFile(indexPath)) {
          sendJson(request, response, 200, { status: 'ok' })
        } else {
          sendJson(request, response, 503, { status: 'not-ready' })
        }
      } catch {
        sendJson(request, response, 503, { status: 'not-ready' })
      }
      return
    }

    try {
      // Inspect before URL normalization so reserved traversal cannot become an SPA route.
      const pathname = decodeURIComponent((request.url ?? '/').split('?')[0])
      const benchmark =
        pathname === '/benchmark' || pathname.startsWith('/benchmark/')
      if (benchmark) {
        const known = [
          '/benchmark',
          '/benchmark/',
          '/benchmark/index.html',
          '/benchmark/run.html',
          '/benchmark/build-identity.json',
          '/benchmark/capabilities',
        ]
        if (benchmarkEnabled !== true || !known.includes(pathname)) {
          sendJson(request, response, 404, { status: 'not-found' })
          return
        }
        if (pathname === '/benchmark/capabilities') {
          const identityPath = resolve(
            resolvedDistRoot,
            'benchmark/build-identity.json',
          )
          if (!(await isFile(identityPath))) {
            sendJson(request, response, 503, { status: 'benchmark-not-ready' })
            return
          }
          sendJson(request, response, 200, {
            enabled: true,
            protocolVersion: 2,
            build: JSON.parse(await readFile(identityPath, 'utf8')),
          })
          return
        }
      }
      const relativePath =
        pathname === '/'
          ? 'index.html'
          : ['/benchmark', '/benchmark/'].includes(pathname)
            ? 'benchmark/index.html'
            : pathname.slice(1)
      let filePath = resolve(resolvedDistRoot, relativePath)
      const staysInsideRoot =
        filePath === resolvedDistRoot ||
        filePath.startsWith(`${resolvedDistRoot}${sep}`)

      if (!staysInsideRoot || pathname.includes('\0')) {
        sendJson(request, response, 404, { status: 'not-found' })
        return
      }

      if (!(await isFile(filePath))) {
        if (benchmark || extname(pathname) !== '') {
          sendJson(request, response, 404, { status: 'not-found' })
          return
        }
        filePath = indexPath
      }

      if (!(await isFile(filePath))) {
        sendJson(request, response, 503, { status: 'not-ready' })
        return
      }

      const content = await readFile(filePath)
      const extension = extname(filePath).toLowerCase()
      const cacheControl = benchmark
        ? 'no-store'
        : filePath === indexPath
          ? 'no-cache'
          : pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600'
      response.writeHead(200, {
        'Content-Type':
          contentTypes.get(extension) ?? 'application/octet-stream',
        'Content-Length': content.byteLength,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      })
      response.end(request.method === 'HEAD' ? undefined : content)
    } catch (error) {
      if (error instanceof URIError) {
        sendJson(request, response, 400, { status: 'bad-request' })
        return
      }
      console.error('Failed to serve request', error)
      sendJson(request, response, 500, { status: 'error' })
    }
  })
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = process.env.HOST ?? '0.0.0.0'
  const distRoot = resolve(process.env.DIST_ROOT ?? 'dist')
  const server = createProductionServer({
    distRoot,
    benchmarkEnabled: process.env.BVR_BENCHMARK_ENABLED === 'true',
  })

  server.listen(port, host, () => {
    console.log(`Bulk Video Review listening on ${host}:${port}`)
  })

  const close = () => server.close(() => process.exit(0))
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
