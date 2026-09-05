// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const lockfile = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
) as { packages: Record<string, { version?: string }> }

// Guard the specific stable release lines remediated here, not the entire
// advisory database. Keep running npm audit to discover new vulnerabilities.
describe.each([
  ['shell-quote', 1, 9, 0],
  ['form-data', 2, 5, 6],
  ['form-data', 4, 0, 6],
  ['postcss', 8, 5, 23],
  ['nanoid', 3, 3, 18],
] as const)('%s major %i security floor', (name, major, minor, patch) => {
  test(`contains no installed copy below ${major}.${minor}.${patch}`, () => {
    for (const [path, entry] of Object.entries(lockfile.packages)) {
      if (!path.endsWith(`node_modules/${name}`) || !entry.version) continue

      const parts = entry.version.split('.').map(Number)
      if (parts[0] !== major) continue

      expect(entry.version, path).toMatch(/^\d+\.\d+\.\d+$/)
      expect(
        parts[1] > minor || (parts[1] === minor && parts[2] >= patch),
        `${path}@${entry.version} must be at least ${major}.${minor}.${patch}`,
      ).toBe(true)
    }
  })
})

test.each([
  ['vite', 7, 3, 6],
  ['vitest', 4, 1, 11],
  ['happy-dom', 20, 14, 0],
] as const)(
  '%s uses the selected supported release or newer',
  (name, major, minor, patch) => {
    const version = lockfile.packages[`node_modules/${name}`].version!
    const parts = version.split('.').map(Number)

    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(
      parts[0] > major ||
        (parts[0] === major &&
          (parts[1] > minor || (parts[1] === minor && parts[2] >= patch))),
      `${name}@${version} must be at least ${major}.${minor}.${patch}`,
    ).toBe(true)
  },
)

test('pins Vitest and its coverage provider to the same selected release', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { devDependencies: Record<string, string> }
  const version = lockfile.packages['node_modules/vitest'].version

  expect(version).toBe('4.1.11')
  expect(lockfile.packages['node_modules/@vitest/coverage-v8'].version).toBe(
    version,
  )
  expect(manifest.devDependencies.vitest).toBe(version)
  expect(manifest.devDependencies['@vitest/coverage-v8']).toBe(version)
})
