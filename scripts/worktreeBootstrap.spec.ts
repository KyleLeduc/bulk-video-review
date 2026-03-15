// @vitest-environment node

import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  bootstrapWorktree,
  buildWorktreeAddArgs,
  buildWorktreeRemoveArgs,
  getDefaultWorktreePath,
} from './worktreeBootstrap'

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-bootstrap-'))
  const workspaceRoot = join(root, 'repo')
  const worktreeRoot = join(workspaceRoot, '.worktrees', 'feature-demo')

  mkdirSync(workspaceRoot, { recursive: true })
  mkdirSync(worktreeRoot, { recursive: true })
  mkdirSync(join(workspaceRoot, 'node_modules'), { recursive: true })
  writeFileSync(join(workspaceRoot, 'package.json'), '{}\n')
  writeFileSync(join(worktreeRoot, 'package.json'), '{}\n')

  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    workspaceRoot,
    worktreeRoot,
  }
}

describe('worktree bootstrap', () => {
  test('creates a relative node_modules symlink for a worktree', () => {
    const fixture = createFixture()

    try {
      const result = bootstrapWorktree(
        fixture.worktreeRoot,
        fixture.workspaceRoot,
      )
      const nodeModulesPath = join(fixture.worktreeRoot, 'node_modules')

      expect(lstatSync(nodeModulesPath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(nodeModulesPath)).toBe(
        relative(
          fixture.worktreeRoot,
          join(fixture.workspaceRoot, 'node_modules'),
        ),
      )
      expect(result.created).toContain('node_modules')
    } finally {
      fixture.cleanup()
    }
  })

  test('links repo-root env files into the worktree when missing', () => {
    const fixture = createFixture()

    try {
      writeFileSync(join(fixture.workspaceRoot, '.env.local'), 'VITE_FLAG=1\n')
      writeFileSync(
        join(fixture.workspaceRoot, '.env.development.local'),
        'VITE_NAME=demo\n',
      )

      const result = bootstrapWorktree(
        fixture.worktreeRoot,
        fixture.workspaceRoot,
      )
      const envLocalPath = join(fixture.worktreeRoot, '.env.local')

      expect(lstatSync(envLocalPath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(envLocalPath)).toBe(
        relative(
          fixture.worktreeRoot,
          join(fixture.workspaceRoot, '.env.local'),
        ),
      )
      expect(
        readFileSync(
          resolve(dirname(envLocalPath), readlinkSync(envLocalPath)),
          'utf8',
        ),
      ).toBe('VITE_FLAG=1\n')
      expect(result.created).toContain('.env.local')
      expect(result.created).toContain('.env.development.local')
    } finally {
      fixture.cleanup()
    }
  })

  test('does not overwrite an existing non-symlink file in the worktree', () => {
    const fixture = createFixture()

    try {
      writeFileSync(join(fixture.workspaceRoot, '.env.local'), 'VITE_FLAG=1\n')
      writeFileSync(
        join(fixture.worktreeRoot, '.env.local'),
        'WORKTREE_ONLY=1\n',
      )

      const result = bootstrapWorktree(
        fixture.worktreeRoot,
        fixture.workspaceRoot,
      )
      const envLocalPath = join(fixture.worktreeRoot, '.env.local')

      expect(lstatSync(envLocalPath).isSymbolicLink()).toBe(false)
      expect(readFileSync(envLocalPath, 'utf8')).toBe('WORKTREE_ONLY=1\n')
      expect(result.skipped).toContain('.env.local')
    } finally {
      fixture.cleanup()
    }
  })
})

describe('worktree add helpers', () => {
  test('uses a default .worktrees path derived from the branch name', () => {
    expect(
      getDefaultWorktreePath(
        '/workspaces/bulk-video-review',
        'feature/thumb-queue',
      ),
    ).toBe('/workspaces/bulk-video-review/.worktrees/feature-thumb-queue')
  })

  test('builds git worktree add args for a new branch and explicit path', () => {
    expect(
      buildWorktreeAddArgs({
        branchName: 'feature/thumb-queue',
        branchExists: false,
        worktreePath: '/tmp/thumb-queue',
      }),
    ).toEqual([
      'worktree',
      'add',
      '-b',
      'feature/thumb-queue',
      '/tmp/thumb-queue',
    ])
  })

  test('builds git worktree add args for an existing branch', () => {
    expect(
      buildWorktreeAddArgs({
        branchName: 'feature/thumb-queue',
        branchExists: true,
        worktreePath: '/tmp/thumb-queue',
      }),
    ).toEqual(['worktree', 'add', '/tmp/thumb-queue', 'feature/thumb-queue'])
  })

  test('builds git worktree remove args for an existing worktree path', () => {
    expect(buildWorktreeRemoveArgs('/tmp/thumb-queue')).toEqual([
      'worktree',
      'remove',
      '/tmp/thumb-queue',
    ])
  })
})
