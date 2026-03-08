// @vitest-environment node

import { describe, expect, test } from 'vitest'
import {
  ROOT_DEV_PORT,
  getStopTargetPids,
  getWorktreeKey,
  pickWorktreePort,
  resolveViteBin,
  type ViteServerProcess,
} from './worktreeDev'

const workspaceRoot = '/workspaces/bulk-video-review'
const nestedWorktree = '/workspaces/bulk-video-review/.worktrees/feat-a'
const otherWorktree = '/workspaces/bulk-video-review/.worktrees/feat-b'

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
    const localBin = `${nestedWorktree}/node_modules/vite/bin/vite.js`
    const sharedPackage = `${workspaceRoot}/node_modules/vite/package.json`
    const sharedBin = `${workspaceRoot}/node_modules/vite/bin/vite.js`

    const viteBin = resolveViteBin(nestedWorktree, {
      existsSync: (path) => path === sharedBin,
      resolveModulePath: (specifier) => {
        expect(specifier).toBe('vite/package.json')
        expect(localBin).not.toBe(sharedBin)
        return sharedPackage
      },
    })

    expect(viteBin).toBe(sharedBin)
  })
})
