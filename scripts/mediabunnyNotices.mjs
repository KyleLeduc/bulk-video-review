import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

export function createMediabunnyAssets() {
  const require = createRequire(import.meta.url)
  const packageRoot = resolve(dirname(require.resolve('mediabunny')), '../..')
  const metadata = JSON.parse(
    readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
  )
  if (metadata.name !== 'mediabunny' || metadata.version !== '1.55.7')
    throw new Error('Expected exact Mediabunny 1.55.7 source')
  const archive = execFileSync(
    'tar',
    [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '-czf',
      '-',
      '-C',
      packageRoot,
      '.',
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  return new Map([
    [
      'third-party/mediabunny/LICENSE.txt',
      readFileSync(resolve(packageRoot, 'LICENSE'), 'utf8'),
    ],
    ['third-party/mediabunny/mediabunny-1.55.7.tar.gz', archive],
    [
      'third-party/mediabunny/index.html',
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Mediabunny notices</title><h1>Mediabunny 1.55.7</h1><p>By Vanilagy and contributors. Used unmodified in the experimental custom-file preview benchmark.</p><p>Mediabunny is licensed under the <a href="LICENSE.txt">Mozilla Public License 2.0</a>.</p><p><a href="mediabunny-1.55.7.tar.gz">Download the corresponding installed package, including original source and notices</a>. This archive is generated from the exact package used by this build, without a network fetch. Original source-file notices are preserved.</p><p><a href="https://github.com/Vanilagy/mediabunny">Upstream project</a> · <a href="/benchmark/">Back to benchmark</a></p></html>`,
    ],
  ])
}

export function mediabunnyNoticesPlugin() {
  let assets
  const getAssets = () => (assets ??= createMediabunnyAssets())
  return {
    name: 'mediabunny-source-notices',
    generateBundle() {
      for (const [fileName, source] of getAssets())
        this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0].slice(1)
        if (!path.startsWith('third-party/mediabunny/')) return next()
        const source = getAssets().get(path)
        if (!source) return next()
        response.setHeader(
          'Content-Type',
          path.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : path.endsWith('.txt')
              ? 'text/plain; charset=utf-8'
              : 'application/gzip',
        )
        response.end(source)
      })
    },
  }
}
