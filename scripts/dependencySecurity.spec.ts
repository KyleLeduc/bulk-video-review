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
