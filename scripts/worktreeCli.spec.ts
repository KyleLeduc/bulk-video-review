// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  getDefaultCommandChoices,
  createWorktreeCliHandlers,
  runDefaultWorktreeCli,
  runWorktreeCli,
  runWorktreeCliSafely,
} from './worktreeCli'

const createHandlers = () => ({
  add: vi.fn(async () => 0),
  bootstrap: vi.fn(async () => 0),
  help: vi.fn(async () => 0),
  ls: vi.fn(async () => 0),
  promptForCommand: vi.fn(),
  ps: vi.fn(async () => 0),
  remove: vi.fn(async () => 0),
  stop: vi.fn(async () => 0),
  up: vi.fn(async () => 0),
})

const createManagedWorktreeFixture = (names: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-cli-'))
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

describe('worktree cli', () => {
  test('dispatches canonical flat verbs', async () => {
    const handlers = createHandlers()

    await expect(
      runWorktreeCli(['remove', 'thumbnail-queue'], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: false,
      }),
    ).resolves.toBe(0)

    expect(handlers.remove).toHaveBeenCalledWith({
      args: ['thumbnail-queue'],
      cwd: '/workspaces/bulk-video-review',
      interactive: false,
    })
  })

  test('maps compatibility aliases to canonical verbs', async () => {
    const handlers = createHandlers()

    await expect(
      runWorktreeCli(['status'], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: false,
      }),
    ).resolves.toBe(0)

    expect(handlers.ps).toHaveBeenCalledWith({
      args: [],
      cwd: '/workspaces/bulk-video-review',
      interactive: false,
    })
  })

  test('dispatches the help verb', async () => {
    const handlers = createHandlers()

    await expect(
      runWorktreeCli(['help'], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: false,
      }),
    ).resolves.toBe(0)

    expect(handlers.help).toHaveBeenCalledWith({
      args: [],
      cwd: '/workspaces/bulk-video-review',
      interactive: false,
    })
  })

  test('uses the interactive launcher when no args are provided in a tty', async () => {
    const handlers = createHandlers()
    handlers.promptForCommand.mockResolvedValue({
      forcePromptForTarget: true,
      verb: 'up',
    })

    await expect(
      runWorktreeCli([], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: true,
      }),
    ).resolves.toBe(0)

    expect(handlers.promptForCommand).toHaveBeenCalledTimes(1)
    expect(handlers.up).toHaveBeenCalledWith({
      args: [],
      cwd: '/workspaces/bulk-video-review',
      forcePromptForTarget: true,
      interactive: true,
    })
  })

  test('fails with help text when no args are provided in a non-interactive shell', async () => {
    const handlers = createHandlers()
    const stderr = {
      error: vi.fn(),
      log: vi.fn(),
    }

    await expect(
      runWorktreeCli([], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: false,
        stderr,
      }),
    ).resolves.toBe(1)

    expect(handlers.promptForCommand).not.toHaveBeenCalled()
    expect(stderr.error).toHaveBeenCalledWith(
      expect.stringContaining('requires a subcommand'),
    )
  })

  test('formats thrown command errors without a stack trace', async () => {
    const handlers = createHandlers()
    handlers.up.mockRejectedValue(new Error('Unable to find a worktree root.'))
    const stderr = {
      error: vi.fn(),
    }

    await expect(
      runWorktreeCliSafely(['up', 'missing'], {
        cwd: '/workspaces/bulk-video-review',
        handlers,
        interactive: false,
        stderr,
      }),
    ).resolves.toBe(1)

    expect(stderr.error).toHaveBeenCalledWith('Unable to find a worktree root.')
  })

  test('lists managed worktrees through the default handler layer', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }
    const services = {
      add: vi.fn(),
      bootstrap: vi.fn(),
      listManagedWorktrees: vi.fn(() => [
        {
          alreadyRunning: true,
          name: 'thumbnail-queue',
          path: '/repo/.worktrees/thumbnail-queue',
          port: 5262,
        },
      ]),
      listProcesses: vi.fn(() => []),
      resolveTarget: vi.fn(),
      runUp: vi.fn(),
      stopPid: vi.fn(),
      stopTarget: vi.fn(),
    }

    const handlers = createWorktreeCliHandlers({
      io,
      promptForCommand: vi.fn(),
      promptForTarget: vi.fn(),
      services,
    })

    await expect(
      handlers.ls({
        args: [],
        cwd: '/repo',
        interactive: false,
      }),
    ).resolves.toBe(0)

    expect(services.listManagedWorktrees).toHaveBeenCalledWith('/repo')
    expect(io.log).toHaveBeenCalledWith('Managed worktrees:')
    expect(io.log).toHaveBeenCalledWith(
      expect.stringContaining('thumbnail-queue'),
    )
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining('5262'))
  })

  test('stops a specific pid through the handler layer', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }
    const services = {
      add: vi.fn(),
      bootstrap: vi.fn(),
      listManagedWorktrees: vi.fn(() => []),
      listProcesses: vi.fn(() => []),
      resolveTarget: vi.fn(),
      runUp: vi.fn(),
      stopPid: vi.fn(() => true),
      stopTarget: vi.fn(),
    }

    const handlers = createWorktreeCliHandlers({
      io,
      promptForCommand: vi.fn(),
      promptForTarget: vi.fn(),
      services,
    })

    await expect(
      handlers.stop({
        args: ['--pid', '42'],
        cwd: '/repo',
        interactive: false,
      }),
    ).resolves.toBe(0)

    expect(services.stopPid).toHaveBeenCalledWith(42)
    expect(services.stopTarget).not.toHaveBeenCalled()
  })

  test('prompts for a target when interactive up is selected from the launcher', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }
    const services = {
      add: vi.fn(),
      bootstrap: vi.fn(),
      help: vi.fn(),
      listManagedWorktrees: vi.fn(() => []),
      listProcesses: vi.fn(() => []),
      remove: vi.fn(),
      resolveTarget: vi.fn(() => '/repo/.worktrees/current'),
      runUp: vi.fn(async () => 0),
      stopPid: vi.fn(),
      stopTarget: vi.fn(),
    }
    const promptForTarget = vi.fn(async () => '/repo/.worktrees/alpha')

    const handlers = createWorktreeCliHandlers({
      io,
      promptForCommand: vi.fn(),
      promptForTarget,
      services,
    })

    await expect(
      handlers.up({
        args: [],
        cwd: '/repo',
        forcePromptForTarget: true,
        interactive: true,
      }),
    ).resolves.toBe(0)

    expect(services.resolveTarget).not.toHaveBeenCalled()
    expect(promptForTarget).toHaveBeenCalledWith('/repo')
    expect(services.runUp).toHaveBeenCalledWith('/repo/.worktrees/alpha')
  })

  test('prompts for a target when interactive stop is selected from the launcher', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }
    const services = {
      add: vi.fn(),
      bootstrap: vi.fn(),
      help: vi.fn(),
      listManagedWorktrees: vi.fn(() => []),
      listProcesses: vi.fn(() => []),
      remove: vi.fn(),
      resolveTarget: vi.fn(() => '/repo/.worktrees/current'),
      runUp: vi.fn(),
      stopPid: vi.fn(),
      stopTarget: vi.fn(async () => 0),
    }
    const promptForTarget = vi.fn(async () => '/repo/.worktrees/beta')

    const handlers = createWorktreeCliHandlers({
      io,
      promptForCommand: vi.fn(),
      promptForTarget,
      services,
    })

    await expect(
      handlers.stop({
        args: [],
        cwd: '/repo',
        forcePromptForTarget: true,
        interactive: true,
      }),
    ).resolves.toBe(0)

    expect(services.resolveTarget).not.toHaveBeenCalled()
    expect(promptForTarget).toHaveBeenCalledWith('/repo')
    expect(services.stopTarget).toHaveBeenCalledWith('/repo/.worktrees/beta')
  })

  test('remove rejects the current worktree target', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }
    const services = {
      add: vi.fn(),
      bootstrap: vi.fn(),
      help: vi.fn(),
      listManagedWorktrees: vi.fn(() => []),
      listProcesses: vi.fn(() => []),
      remove: vi.fn(async () => 0),
      resolveTarget: vi.fn(async () => '/repo/.worktrees/current'),
      runUp: vi.fn(),
      stopPid: vi.fn(),
      stopTarget: vi.fn(),
    }

    const handlers = createWorktreeCliHandlers({
      io,
      promptForCommand: vi.fn(),
      promptForTarget: vi.fn(),
      services,
    })

    await expect(
      handlers.remove({
        args: ['current'],
        cwd: '/repo/.worktrees/current',
        interactive: false,
      }),
    ).resolves.toBe(1)

    expect(io.error).toHaveBeenCalledWith(
      'Refusing to remove the current worktree checkout.',
    )
    expect(services.remove).not.toHaveBeenCalled()
  })

  test('bootstraps the current checkout when no target is provided', async () => {
    const fixture = createManagedWorktreeFixture(['alpha'])
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }

    try {
      await expect(
        runDefaultWorktreeCli(['bootstrap'], {
          cwd: fixture.repoRoot,
          interactive: false,
          io,
        }),
      ).resolves.toBe(0)

      expect(io.error).not.toHaveBeenCalled()
      expect(io.log).toHaveBeenCalledWith(
        `Bootstrapped worktree ${fixture.repoRoot}.`,
      )
    } finally {
      fixture.cleanup()
    }
  })

  test('prints concise help output from the default CLI', async () => {
    const io = {
      error: vi.fn(),
      log: vi.fn(),
    }

    await expect(
      runDefaultWorktreeCli(['help'], {
        cwd: '/workspaces/bulk-video-review',
        interactive: false,
        io,
      }),
    ).resolves.toBe(0)

    expect(io.error).not.toHaveBeenCalled()
    expect(io.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: npm run worktree -- <command>'),
    )
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining('help'))
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining('remove'))
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining('up'))
  })

  test('includes short descriptions for the interactive command menu', () => {
    expect(getDefaultCommandChoices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Up',
          description: expect.any(String),
        }),
        expect.objectContaining({
          title: 'Help',
          description: expect.any(String),
        }),
        expect.objectContaining({
          title: 'Remove',
          description: expect.any(String),
        }),
      ]),
    )
  })
})
