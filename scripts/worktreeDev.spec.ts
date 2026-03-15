// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  ROOT_DEV_PORT,
  getStopTargetPids,
  listManagedWorktreeChoices,
  listManagedWorktreeRoots,
  parseManagedWorktreeSelection,
  resolveWorktreeTarget,
  resolveWorktreeDevTarget,
  getWorkspaceRoot,
  getWorktreeKey,
  pickWorktreePort,
  resolveViteBin,
  type ViteServerProcess,
} from './worktreeDev'

const workspaceRoot = '/workspaces/bulk-video-review'
const nestedWorktree = '/workspaces/bulk-video-review/.worktrees/feat-a'
const otherWorktree = '/workspaces/bulk-video-review/.worktrees/feat-b'

const createLinkedWorktreeFixture = (segments: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-dev-'))
  const repoRoot = join(root, 'repo')
  const worktreeRoot = join(root, ...segments)
  const worktreeKey = segments[segments.length - 1]

  mkdirSync(join(repoRoot, '.git', 'worktrees', worktreeKey), {
    recursive: true,
  })
  mkdirSync(worktreeRoot, { recursive: true })
  writeFileSync(
    join(worktreeRoot, '.git'),
    `gitdir: ${join(repoRoot, '.git', 'worktrees', worktreeKey)}\n`,
  )

  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    repoRoot,
    worktreeKey,
    worktreeRoot,
  }
}

const createManagedWorktreeFixture = (names: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-picker-'))
  const repoRoot = join(root, 'repo')

  mkdirSync(join(repoRoot, '.git', 'worktrees'), { recursive: true })
  writeFileSync(join(repoRoot, 'package.json'), '{}\n')

  const worktrees = names.map((name) => {
    const worktreeRoot = join(repoRoot, '.worktrees', name)

    mkdirSync(join(repoRoot, '.git', 'worktrees', name), {
      recursive: true,
    })
    mkdirSync(worktreeRoot, { recursive: true })
    writeFileSync(
      join(worktreeRoot, '.git'),
      `gitdir: ${join(repoRoot, '.git', 'worktrees', name)}\n`,
    )
    writeFileSync(join(worktreeRoot, 'package.json'), '{}\n')

    return {
      name,
      worktreeRoot,
    }
  })

  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    repoRoot,
    worktrees,
  }
}

describe('worktree dev helpers', () => {
  test('keeps the main workspace on the default vite port', () => {
    const selection = pickWorktreePort({
      worktreeRoot: workspaceRoot,
      activeServers: [],
    })

    expect(selection).toEqual({
      alreadyRunning: false,
      port: ROOT_DEV_PORT,
    })
  })

  test('derives a stable non-root port for nested worktrees', () => {
    const first = pickWorktreePort({
      worktreeRoot: nestedWorktree,
      activeServers: [],
    })
    const second = pickWorktreePort({
      worktreeRoot: nestedWorktree,
      activeServers: [],
    })

    expect(first.port).toBeGreaterThan(ROOT_DEV_PORT)
    expect(first).toEqual(second)
    expect(getWorktreeKey(nestedWorktree)).toBe('feat-a')
  })

  test('derives the repository root and key for worktrees/ layouts from git metadata', () => {
    const fixture = createLinkedWorktreeFixture(['repo', 'worktrees', 'feat-c'])

    try {
      expect(getWorkspaceRoot(fixture.worktreeRoot)).toBe(fixture.repoRoot)
      expect(getWorktreeKey(fixture.worktreeRoot)).toBe(fixture.worktreeKey)
      expect(
        pickWorktreePort({
          worktreeRoot: fixture.worktreeRoot,
          activeServers: [],
        }),
      ).toEqual({
        alreadyRunning: false,
        port: expect.any(Number),
      })
      expect(
        pickWorktreePort({
          worktreeRoot: fixture.worktreeRoot,
          activeServers: [],
        }).port,
      ).toBeGreaterThan(ROOT_DEV_PORT)
    } finally {
      fixture.cleanup()
    }
  })

  test('derives the repository root and key for external worktrees from git metadata', () => {
    const fixture = createLinkedWorktreeFixture([
      '.config',
      'superpowers',
      'worktrees',
      'bulk-video-review',
      'feat-d',
    ])

    try {
      expect(getWorkspaceRoot(fixture.worktreeRoot)).toBe(fixture.repoRoot)
      expect(getWorktreeKey(fixture.worktreeRoot)).toBe(fixture.worktreeKey)
      expect(
        pickWorktreePort({
          worktreeRoot: fixture.worktreeRoot,
          activeServers: [],
        }).port,
      ).toBeGreaterThan(ROOT_DEV_PORT)
    } finally {
      fixture.cleanup()
    }
  })

  test('reuses the existing port when the current worktree already has a vite server', () => {
    const selection = pickWorktreePort({
      worktreeRoot: nestedWorktree,
      activeServers: [
        {
          pid: 12,
          cwd: nestedWorktree,
          cmd: 'node vite',
          ports: [5260],
        },
      ],
    })

    expect(selection).toEqual({
      alreadyRunning: true,
      port: 5260,
    })
  })

  test('moves to the next free port when the preferred port is occupied by another worktree', () => {
    const occupied = pickWorktreePort({
      worktreeRoot: nestedWorktree,
      activeServers: [],
    }).port

    const selection = pickWorktreePort({
      worktreeRoot: nestedWorktree,
      activeServers: [
        {
          pid: 20,
          cwd: otherWorktree,
          cmd: 'node vite',
          ports: [occupied],
        },
      ],
    })

    expect(selection).toEqual({
      alreadyRunning: false,
      port: occupied + 1,
    })
  })

  test('selects stop targets only for the current worktree', () => {
    const processes: ViteServerProcess[] = [
      {
        pid: 101,
        cwd: workspaceRoot,
        cmd: 'node vite',
        ports: [5173],
      },
      {
        pid: 202,
        cwd: nestedWorktree,
        cmd: 'node vite',
        ports: [5261],
      },
      {
        pid: 303,
        cwd: nestedWorktree,
        cmd: 'node vite',
        ports: [5262],
      },
      {
        pid: 404,
        cwd: otherWorktree,
        cmd: 'node vite',
        ports: [5263],
      },
    ]

    expect(getStopTargetPids(processes, nestedWorktree)).toEqual([202, 303])
  })

  test('resolves vite from the shared workspace install when the worktree has no local package', () => {
    const fixture = createLinkedWorktreeFixture([
      '.config',
      'superpowers',
      'worktrees',
      'bulk-video-review',
      'feat-shared-vite',
    ])

    try {
      mkdirSync(join(fixture.repoRoot, 'node_modules', 'vite', 'bin'), {
        recursive: true,
      })
      writeFileSync(join(fixture.repoRoot, 'package.json'), '{}\n')
      writeFileSync(join(fixture.worktreeRoot, 'package.json'), '{}\n')
      writeFileSync(
        join(fixture.repoRoot, 'node_modules', 'vite', 'package.json'),
        '{}\n',
      )
      writeFileSync(
        join(fixture.repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
        '',
      )

      const viteBin = resolveViteBin(fixture.worktreeRoot)

      expect(viteBin).toBe(
        join(fixture.repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      )
    } finally {
      fixture.cleanup()
    }
  })

  test('lists managed worktrees in sorted order and ignores non-directory entries', () => {
    const fixture = createManagedWorktreeFixture(['zeta', 'alpha'])

    try {
      writeFileSync(
        join(fixture.repoRoot, '.worktrees', 'README.md'),
        '# notes\n',
      )

      expect(listManagedWorktreeRoots(fixture.repoRoot)).toEqual([
        join(fixture.repoRoot, '.worktrees', 'alpha'),
        join(fixture.repoRoot, '.worktrees', 'zeta'),
      ])
    } finally {
      fixture.cleanup()
    }
  })

  test('keeps the current linked worktree target without prompting', async () => {
    const fixture = createManagedWorktreeFixture(['alpha', 'beta'])
    const promptForChoice = vi.fn()

    try {
      await expect(
        resolveWorktreeDevTarget({
          cwd: fixture.worktrees[0].worktreeRoot,
          interactive: true,
          promptForChoice,
        }),
      ).resolves.toBe(fixture.worktrees[0].worktreeRoot)
      expect(promptForChoice).not.toHaveBeenCalled()
    } finally {
      fixture.cleanup()
    }
  })

  test('uses the explicit target without prompting from the workspace root', async () => {
    const fixture = createManagedWorktreeFixture(['alpha', 'beta'])
    const promptForChoice = vi.fn()

    try {
      await expect(
        resolveWorktreeDevTarget({
          cwd: fixture.repoRoot,
          targetArg: 'beta',
          interactive: false,
          promptForChoice,
        }),
      ).resolves.toBe(fixture.worktrees[1].worktreeRoot)
      expect(promptForChoice).not.toHaveBeenCalled()
    } finally {
      fixture.cleanup()
    }
  })

  test('prompts for a managed worktree when run from the workspace root', async () => {
    const fixture = createManagedWorktreeFixture(['alpha', 'beta'])
    const activeServers: ViteServerProcess[] = [
      {
        pid: 41,
        cwd: fixture.worktrees[0].worktreeRoot,
        cmd: 'node vite',
        ports: [5260],
      },
    ]
    const promptForChoice = vi.fn(async (choices) => {
      expect(choices).toMatchObject([
        {
          alreadyRunning: true,
          name: 'alpha',
          path: fixture.worktrees[0].worktreeRoot,
          port: 5260,
        },
        {
          alreadyRunning: false,
          name: 'beta',
          path: fixture.worktrees[1].worktreeRoot,
          port: expect.any(Number),
        },
      ])

      return choices[1]
    })

    try {
      await expect(
        resolveWorktreeDevTarget({
          activeServers,
          cwd: fixture.repoRoot,
          interactive: true,
          promptForChoice,
        }),
      ).resolves.toBe(fixture.worktrees[1].worktreeRoot)
      expect(promptForChoice).toHaveBeenCalledTimes(1)
    } finally {
      fixture.cleanup()
    }
  })

  test('fails fast without a tty when managed worktrees exist at the workspace root', async () => {
    const fixture = createManagedWorktreeFixture(['alpha'])

    try {
      await expect(
        resolveWorktreeDevTarget({
          cwd: fixture.repoRoot,
          interactive: false,
        }),
      ).rejects.toThrow(/interactive terminal/i)
    } finally {
      fixture.cleanup()
    }
  })

  test('returns managed worktree choices annotated with runtime status', () => {
    const fixture = createManagedWorktreeFixture(['alpha', 'beta'])

    try {
      expect(
        listManagedWorktreeChoices(fixture.repoRoot, [
          {
            pid: 41,
            cwd: fixture.worktrees[0].worktreeRoot,
            cmd: 'node vite',
            ports: [5260],
          },
        ]),
      ).toMatchObject([
        {
          alreadyRunning: true,
          name: 'alpha',
          path: fixture.worktrees[0].worktreeRoot,
          port: 5260,
        },
        {
          alreadyRunning: false,
          name: 'beta',
          path: fixture.worktrees[1].worktreeRoot,
          port: expect.any(Number),
        },
      ])
    } finally {
      fixture.cleanup()
    }
  })

  test('resolves to null at the workspace root when interactive selection is needed', async () => {
    const fixture = createManagedWorktreeFixture(['alpha'])

    try {
      await expect(
        resolveWorktreeTarget({
          cwd: fixture.repoRoot,
          interactive: true,
        }),
      ).resolves.toBeNull()
    } finally {
      fixture.cleanup()
    }
  })

  test('rejects malformed interactive selection input', () => {
    expect(parseManagedWorktreeSelection('', 2)).toBeNull()
    expect(parseManagedWorktreeSelection('1abc', 2)).toBe(-1)
    expect(parseManagedWorktreeSelection('1.5', 2)).toBe(-1)
    expect(parseManagedWorktreeSelection('3', 2)).toBe(-1)
    expect(parseManagedWorktreeSelection('2', 2)).toBe(1)
  })
})
