import prompts from 'prompts'
import {
  addAndBootstrapWorktree,
  bootstrapCurrentOrSpecifiedWorktree,
  removeWorktree,
} from '../worktreeBootstrap'
import {
  formatProcessSummary,
  findWorktreeRoot,
  getWorktreeKey,
  getWorkspaceRoot,
  listManagedWorktreeChoices,
  listViteProcesses,
  resolveWorktreeTarget,
  runWorktreeDevServer,
  stopWorktreeDevServers,
} from '../worktreeDev'
import {
  createWorktreeCliHandlers,
  runWorktreeCliSafely,
  type CommandSelection,
  type WorktreeCliHandlers,
  type WorktreeCliIo,
  type WorktreeCliServices,
} from './core'

type DefaultWorktreeCliOptions = {
  cwd?: string
  interactive?: boolean
  io?: WorktreeCliIo
}

type DefaultCommandChoice = {
  description: string
  title: string
  value: CommandSelection | null
}

const DEFAULT_COMMAND_CHOICES: DefaultCommandChoice[] = [
  {
    description: 'Start a dev server',
    title: 'Up',
    value: { forcePromptForTarget: true, verb: 'up' },
  },
  {
    description: 'List managed worktrees',
    title: 'List Worktrees',
    value: { verb: 'ls' },
  },
  {
    description: 'List running servers',
    title: 'List Processes',
    value: { verb: 'ps' },
  },
  {
    description: 'Stop a dev server',
    title: 'Stop',
    value: { forcePromptForTarget: true, verb: 'stop' },
  },
  {
    description: 'Create a worktree',
    title: 'Add',
    value: { verb: 'add' },
  },
  {
    description: 'Link shared files',
    title: 'Bootstrap',
    value: { verb: 'bootstrap' },
  },
  {
    description: 'Delete a worktree',
    title: 'Remove',
    value: { verb: 'remove' },
  },
  {
    description: 'Show command usage',
    title: 'Help',
    value: { verb: 'help' },
  },
  {
    description: 'Leave the launcher',
    title: 'Exit',
    value: null,
  },
]

const HELP_TEXT = `Usage: npm run worktree -- <command> [args]

Commands:
  help                  Show command usage
  ls                    List managed worktrees
  ps                    List running Vite servers
  up [target]           Start or reuse a dev server
  stop [target]         Stop a worktree dev server
  stop --pid <pid>      Stop a server by pid
  add <branch> [path]   Create and bootstrap a worktree
  bootstrap [path]      Bootstrap the current or target worktree
  remove <target>       Remove a worktree checkout

Interactive:
  npm run worktree

Legacy wrappers:
  npm run dev:worktree -- [target]
  npm run dev:status
  npm run dev:stop
  npm run worktree:add -- <branch> [path]
  npm run worktree:bootstrap -- [path]`

const promptForSelect = async <T>(
  message: string,
  choices: Array<{
    description?: string
    title: string
    value: T
  }>,
): Promise<T | null> => {
  const response = await prompts(
    {
      choices,
      message,
      name: 'value',
      type: 'select',
    },
    {
      onCancel: () => false,
    },
  )

  return (response.value ?? null) as T | null
}

const promptForText = async (
  message: string,
  initial = '',
): Promise<string | null> => {
  const response = await prompts(
    {
      initial,
      message,
      name: 'value',
      type: 'text',
    },
    {
      onCancel: () => false,
    },
  )

  const value = response.value?.trim()
  return value ? value : null
}

const buildWorktreeStatusLabel = (worktree: {
  alreadyRunning: boolean
  name: string
  port: number
}): string =>
  worktree.alreadyRunning
    ? `${worktree.name}  running at http://127.0.0.1:${worktree.port}/`
    : `${worktree.name}  port ${worktree.port}`

const createDefaultPromptForCommand =
  async (): Promise<CommandSelection | null> =>
    await promptForSelect('Choose a worktree command', DEFAULT_COMMAND_CHOICES)

const createDefaultPromptForTarget = async (
  cwd: string,
): Promise<string | null> => {
  const currentWorktreeRoot = findWorktreeRoot(cwd)
  const choices = listManagedWorktreeChoices(
    currentWorktreeRoot,
    listViteProcesses(),
  )

  if (choices.length === 0) {
    return null
  }

  return await promptForSelect(
    'Choose a worktree',
    choices.map((choice) => ({
      description: choice.path,
      title: buildWorktreeStatusLabel(choice),
      value: choice.path,
    })),
  )
}

const createDefaultServices = (io: WorktreeCliIo): WorktreeCliServices => ({
  add: async ({ args, cwd, interactive }) => {
    let [branchName, pathArg] = args

    if (!branchName && interactive) {
      branchName = await promptForText('Branch name')

      if (!branchName) {
        return 0
      }

      pathArg = await promptForText('Optional worktree path override')
    }

    if (!branchName) {
      io.error('Usage: worktree add <branch> [path]')
      return 1
    }

    const result = addAndBootstrapWorktree(branchName, pathArg, cwd)

    io.log(
      `Created worktree ${result.worktreePath}${result.createdBranch ? ` with new branch ${branchName}` : ` for branch ${branchName}`}.`,
    )

    if (result.bootstrap.created.length > 0) {
      io.log(`Bootstrapped: ${result.bootstrap.created.join(', ')}`)
    }

    if (result.bootstrap.existing.length > 0) {
      io.log(`Already linked: ${result.bootstrap.existing.join(', ')}`)
    }

    if (result.bootstrap.skipped.length > 0) {
      io.log(`Skipped existing paths: ${result.bootstrap.skipped.join(', ')}`)
    }

    return 0
  },
  bootstrap: async ({ args, cwd, interactive }) => {
    const [targetArg] = args
    const target = targetArg
      ? await resolveWorktreeTarget({
          cwd,
          interactive,
          targetArg,
        })
      : undefined

    const result = bootstrapCurrentOrSpecifiedWorktree(target, cwd)

    io.log(`Bootstrapped worktree ${result.worktreePath}.`)

    if (result.bootstrap.created.length > 0) {
      io.log(`Linked: ${result.bootstrap.created.join(', ')}`)
    }

    if (result.bootstrap.existing.length > 0) {
      io.log(`Already linked: ${result.bootstrap.existing.join(', ')}`)
    }

    if (result.bootstrap.skipped.length > 0) {
      io.log(`Skipped existing paths: ${result.bootstrap.skipped.join(', ')}`)
    }

    return 0
  },
  help: () => {
    io.log(HELP_TEXT)
    return 0
  },
  listManagedWorktrees: (cwd) => {
    const currentWorktreeRoot = findWorktreeRoot(cwd)
    return listManagedWorktreeChoices(currentWorktreeRoot, listViteProcesses())
  },
  listProcesses: (cwd) => {
    const currentWorktreeRoot = findWorktreeRoot(cwd)

    return listViteProcesses().map((process) => ({
      summary: formatProcessSummary(process, currentWorktreeRoot),
    }))
  },
  remove: (target) => {
    if (target === getWorkspaceRoot(target)) {
      io.error('Refusing to remove the main workspace checkout.')
      return 1
    }

    const stoppedPids = stopWorktreeDevServers(target)
    const result = removeWorktree(target)

    if (stoppedPids.length > 0) {
      io.log(
        `Stopped Vite dev server${stoppedPids.length === 1 ? '' : 's'} for ${getWorktreeKey(target)}: ${stoppedPids.join(', ')}`,
      )
    }

    io.log(`Removed worktree ${result.worktreePath}.`)
    return 0
  },
  resolveTarget: ({ args, cwd, interactive }) =>
    resolveWorktreeTarget({
      cwd,
      interactive,
      targetArg: args[0],
    }),
  runUp: (target) => runWorktreeDevServer(target),
  stopPid: (pid) => {
    try {
      process.kill(pid, 'SIGTERM')
      io.log(`Stopped Vite dev server pid=${pid}.`)
      return true
    } catch {
      io.error(`Unable to stop pid ${pid}.`)
      return false
    }
  },
  stopTarget: (target) => {
    const stoppedPids = stopWorktreeDevServers(target)

    if (stoppedPids.length === 0) {
      io.log(`No Vite dev servers found for ${getWorktreeKey(target)}.`)
      return 0
    }

    io.log(
      `Stopped Vite dev server${stoppedPids.length === 1 ? '' : 's'} for ${getWorktreeKey(target)}: ${stoppedPids.join(', ')}`,
    )
    return 0
  },
})

export const createDefaultWorktreeCliHandlers = (
  io: WorktreeCliIo = console,
): WorktreeCliHandlers =>
  createWorktreeCliHandlers({
    io,
    promptForCommand: createDefaultPromptForCommand,
    promptForTarget: createDefaultPromptForTarget,
    services: createDefaultServices(io),
  })

export const runDefaultWorktreeCli = async (
  argv: string[],
  {
    cwd = process.cwd(),
    interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    io = console,
  }: DefaultWorktreeCliOptions = {},
): Promise<number> =>
  await runWorktreeCliSafely(argv, {
    cwd,
    handlers: createDefaultWorktreeCliHandlers(io),
    interactive,
    stderr: io,
  })

export const getDefaultCommandChoices = (): DefaultCommandChoice[] =>
  DEFAULT_COMMAND_CHOICES.map((choice) => ({ ...choice }))

export type { DefaultWorktreeCliOptions }
