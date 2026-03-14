// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  ROOT_DEV_PORT,
  getStopTargetPids,
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
})
