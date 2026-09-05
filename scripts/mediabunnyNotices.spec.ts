// @vitest-environment node
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createMediabunnyAssets } from './mediabunnyNotices.mjs'

it('ships the exact installed package source, notices and MPL without fetching at build time', () => {
  const assets = createMediabunnyAssets()
  expect(assets.get('third-party/mediabunny/index.html')).toContain('1.55.7')
  expect(assets.get('third-party/mediabunny/LICENSE.txt')).toContain(
    'Mozilla Public License Version 2.0',
  )
  const archive = assets.get('third-party/mediabunny/mediabunny-1.55.7.tar.gz')
  const listing = execFileSync('tar', ['-tzf', '-'], {
    input: archive,
  }).toString()
  expect(listing).toContain('./src/media-sink.ts')
  expect(listing).toContain('./LICENSE')
  expect(listing).toContain('./package.json')
  expect(listing).not.toContain('node_modules')
  const metadata = execFileSync('tar', ['-xOzf', '-', './package.json'], {
    input: archive,
  }).toString()
  expect(JSON.parse(metadata).version).toBe('1.55.7')
})
