// @vitest-environment node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import viteConfig from '../vite.config'
import { fingerprintAssets, benchmarkBuildPlugin } from './benchmarkBuild.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('homelab deployment contract', () => {
  test('embeds the build identity for offline ingestion reports and backups', () => {
    vi.stubEnv('BVR_BUILD_REVISION', 'a'.repeat(40))
    try {
      const identity = JSON.parse(
        benchmarkBuildPlugin().config().define.__BVR_BUILD_IDENTITY__,
      )
      expect(identity).toEqual({
        revision: 'a'.repeat(40),
        source: 'build-argument',
        dirty: null,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
  test('keeps the reference-corpus smoke out of the ordinary E2E command', () => {
    const config = read('cypress.config.ts')
    expect(config).toContain("process.env.BVR_BENCHMARK_SMOKE === 'true'")
    for (const spec of ['videoBenchmark', 'customExtraction', 'extractionPlan'])
      expect(config).toContain(`'**/${spec}.cy.ts'`)
    const scripts = JSON.parse(read('package.json')).scripts
    expect(scripts['test:e2e']).not.toContain('BVR_BENCHMARK_SMOKE')
    expect(scripts['test:benchmark']).toContain('BVR_BENCHMARK_SMOKE=true')
  })
  test('fingerprints sorted emitted names and contents without hashing itself', () => {
    const assets = [
      ['assets/a.js', 'first'],
      ['benchmark/index.html', 'second'],
    ]
    const digest = fingerprintAssets(assets)
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(fingerprintAssets([...assets].reverse())).toBe(digest)
    expect(
      fingerprintAssets([
        ...assets,
        ['benchmark/build-identity.json', 'ignored'],
      ]),
    ).toBe(digest)
    expect(fingerprintAssets([['renamed.js', 'first'], assets[1]])).not.toBe(
      digest,
    )
    expect(fingerprintAssets([['assets/a.js', 'changed'], assets[1]])).not.toBe(
      digest,
    )
  })
  test('declares a stateless AMD64 application contract', () => {
    const deployment = read('.homelab/deployment.yml')

    expect(deployment).toContain('app_id: bulk-video-review')
    expect(deployment).toContain('repository: KyleLeduc/bulk-video-review')
    expect(deployment).toContain('dockerfile: Dockerfile.production')
    expect(deployment).toContain('compose_file: docker-compose.production.yml')
    expect(deployment).toContain(
      'revision_label: org.opencontainers.image.revision',
    )
    expect(deployment).toContain('default: linux/amd64')
    expect(deployment).toContain('selectable: []')
    expect(deployment).toContain('container_port: 3000')
    expect(deployment).toContain('live: /health/live')
    expect(deployment).toContain('ready: /health/ready')
    expect(deployment).toContain('stateful: false')
    expect(deployment).toContain('persistent_data: []')
    expect(deployment).toContain('enabled: false')
    expect(deployment).toContain('rollback_policy: not-applicable')
    expect(deployment).toContain('gateway: preprod')
    expect(deployment).toContain('fqdn: bvr.preprod.home.arpa')
  })

  test('builds a pinned non-root image with an immutable revision label', () => {
    const dockerfile = read('Dockerfile.production')

    expect(dockerfile).toMatch(
      /^FROM node:22-bookworm-slim@sha256:[0-9a-f]{64} AS build/m,
    )
    expect(dockerfile).toMatch(
      /^FROM node:22-bookworm-slim@sha256:[0-9a-f]{64} AS runtime/m,
    )
    expect(dockerfile).toContain('npm ci --ignore-scripts')
    expect(dockerfile).toContain(
      'RUN BVR_BUILD_REVISION="$VCS_REF" npm run build',
    )
    expect(dockerfile.split(' AS runtime')[0]).toContain('ARG VCS_REF')
    expect(dockerfile).toContain('ARG VCS_REF')
    expect(dockerfile).toContain(
      'org.opencontainers.image.revision="${VCS_REF}"',
    )
    expect(dockerfile).toContain('USER 10001:10001')
    expect(dockerfile).toContain('EXPOSE 3000')
    expect(dockerfile).toContain(
      'CMD ["node", "/app/scripts/productionServer.mjs"]',
    )
  })

  test('excludes local credentials and tool environments from image builds', () => {
    const ignoredBuildPaths = read('.dockerignore').split(/\r?\n/)

    for (const localPath of ['.config', '.venv', '.worktrees']) {
      expect(ignoredBuildPaths).toContain(localPath)
    }
  })

  test('publishes only a hardened loopback-only stateless service', () => {
    const compose = read('docker-compose.production.yml')

    expect(compose).toContain(
      'image: ${BVR_IMAGE:?set BVR_IMAGE to an immutable registry digest}',
    )
    expect(compose).toContain("'127.0.0.1:18081:3000'")
    expect(compose).toContain('read_only: true')
    expect(compose).toContain('cap_drop:')
    expect(compose).toContain('- ALL')
    expect(compose).toContain('no-new-privileges:true')
    expect(compose).toContain('internal: true')
    expect(compose).toContain("fetch('http://127.0.0.1:3000/health/ready')")
    expect(compose).not.toMatch(/^volumes:/m)
    expect(compose.match(/^ {4}environment:\n(?: {6}.+\n)+/gm)).toEqual([
      '    environment:\n      BVR_BENCHMARK_ENABLED: ${BVR_BENCHMARK_ENABLED:-false}\n',
    ])
  })

  test('replaces GitHub Pages with a root-path production build', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    const config = viteConfig as { base?: string }

    expect(config.base).toBe('/')
    expect(packageJson.scripts.deploy).toBeUndefined()
    expect(packageJson.scripts['deploy:gh']).toBeUndefined()
    expect(packageJson.devDependencies['gh-pages']).toBeUndefined()
    expect(packageJson.scripts.lint).not.toContain('--fix')
    expect(packageJson.scripts['lint:fix']).toContain('--fix')
  })

  test('keeps Vitest worktree exclusions literal in repository-root shells', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['test:unit']).toContain(
      "--exclude '.worktrees/**'",
    )
    expect(packageJson.scripts['test:ci']).toContain(
      "--exclude '.worktrees/**'",
    )
  })

  test('uses pinned trusted CI to publish only immutable AMD64 images', () => {
    const workflow = read('.github/workflows/ci.yml')
    const gitignore = read('.gitignore')

    expect(gitignore).toContain('!.github/workflows/ci.yml')
    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).toContain(
      "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
    )
    expect(workflow).toContain(
      'runs-on: [self-hosted, Linux, X64, homelab-build, bulk-video-review]',
    )
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/)
    expect(workflow).toContain('persist-credentials: false')
    for (const command of [
      'npm ci --ignore-scripts',
      'npm run lint',
      'npm run type-check',
      'npm run test:unit',
      'npm run build',
      'docker compose --file docker-compose.production.yml config --quiet',
    ]) {
      expect(workflow).toContain(command)
    }
    expect(workflow).toContain('TARGET_PLATFORM: linux/amd64')
    expect(workflow).not.toContain('linux/arm64')
    expect(workflow).toContain('--build-arg "VCS_REF=${SOURCE_SHA}"')
    expect(workflow).toContain('"docker://$IMAGE_REPOSITORY:$SOURCE_SHA"')
    expect(workflow).not.toMatch(/[:/]latest\b/)
    expect(workflow).toContain('--severity HIGH,CRITICAL')
    expect(workflow).toContain('--ignore-unfixed')
    expect(workflow).toContain('skopeo copy')
    expect(workflow).toContain("if: steps.build.outputs.publish == 'true'")
    expect(workflow).toContain('if: always()')
  })
})
