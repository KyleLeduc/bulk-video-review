type WorktreeCliContext = {
  args: string[]
  cwd: string
  forcePromptForTarget?: boolean
  interactive: boolean
}

type WorktreeSummary = {
  alreadyRunning: boolean
  name: string
  path: string
  port: number
}

type ProcessSummary = {
  summary: string
}

type CommandSelection = {
  args?: string[]
  forcePromptForTarget?: boolean
  verb: keyof WorktreeCliHandlers
}

type WorktreeCliHandlers = {
  add: (context: WorktreeCliContext) => Promise<number> | number
  bootstrap: (context: WorktreeCliContext) => Promise<number> | number
  help: (context: WorktreeCliContext) => Promise<number> | number
  ls: (context: WorktreeCliContext) => Promise<number> | number
  promptForCommand?: () => Promise<CommandSelection | null>
  ps: (context: WorktreeCliContext) => Promise<number> | number
  remove: (context: WorktreeCliContext) => Promise<number> | number
  stop: (context: WorktreeCliContext) => Promise<number> | number
  up: (context: WorktreeCliContext) => Promise<number> | number
}

type WorktreeCliIo = Pick<typeof console, 'error' | 'log'>

type WorktreeCliServices = {
  add: (context: WorktreeCliContext) => Promise<number> | number
  bootstrap: (context: WorktreeCliContext) => Promise<number> | number
  help: (context: WorktreeCliContext) => Promise<number> | number
  listManagedWorktrees: (cwd: string) => WorktreeSummary[]
  listProcesses: (cwd: string) => ProcessSummary[]
  remove: (target: string) => Promise<number> | number
  resolveTarget: (
    context: WorktreeCliContext,
  ) => Promise<string | null> | string | null
  runUp: (target: string) => Promise<number> | number
  stopPid: (pid: number) => boolean
  stopTarget: (target: string) => Promise<number> | number
}

type WorktreeCliDependencies = {
  cwd?: string
  handlers: WorktreeCliHandlers
  interactive: boolean
  stderr?: Pick<typeof console, 'error'>
}

type RunWorktreeCliSafelyOptions = WorktreeCliDependencies

type CreateWorktreeCliHandlersOptions = {
  io: WorktreeCliIo
  promptForCommand: () => Promise<CommandSelection | null>
  promptForTarget: (cwd: string) => Promise<string | null>
  services: WorktreeCliServices
}

const ALIASES: Record<string, keyof WorktreeCliHandlers> = {
  run: 'up',
  start: 'up',
  status: 'ps',
}

const VERBS = new Set<keyof WorktreeCliHandlers>([
  'add',
  'bootstrap',
  'help',
  'ls',
  'ps',
  'remove',
  'stop',
  'up',
])

const resolveVerb = (verb: string): keyof WorktreeCliHandlers | null => {
  if (verb in ALIASES) {
    return ALIASES[verb]
  }

  if (VERBS.has(verb as keyof WorktreeCliHandlers)) {
    return verb as keyof WorktreeCliHandlers
  }

  return null
}

const parsePidArg = (args: string[]): number | null => {
  const pidFlagIndex = args.indexOf('--pid')

  if (pidFlagIndex === -1) {
    return null
  }

  const pidValue = args[pidFlagIndex + 1]

  if (!pidValue || !/^\d+$/.test(pidValue)) {
    return -1
  }

  return Number.parseInt(pidValue, 10)
}

const formatWorktreeSummary = (summary: WorktreeSummary): string =>
  `${summary.alreadyRunning ? 'running' : 'stopped'}\tport=${summary.port}\t${summary.name}\t${summary.path}`

export const runWorktreeCli = async (
  argv: string[],
  {
    cwd = process.cwd(),
    handlers,
    interactive,
    stderr = console,
  }: WorktreeCliDependencies,
): Promise<number> => {
  if (argv.length === 0) {
    if (!interactive) {
      stderr.error(
        'worktree requires a subcommand in non-interactive terminals.',
      )
      return 1
    }

    if (!handlers.promptForCommand) {
      stderr.error('Interactive mode requires a command launcher.')
      return 1
    }

    const selection = await handlers.promptForCommand()

    if (!selection) {
      return 0
    }

    return await handlers[selection.verb]({
      args: selection.args ?? [],
      cwd,
      forcePromptForTarget: selection.forcePromptForTarget,
      interactive,
    })
  }

  const [rawVerb, ...args] = argv
  const verb = resolveVerb(rawVerb)

  if (!verb) {
    stderr.error(`Unknown worktree command "${rawVerb}".`)
    return 1
  }

  return await handlers[verb]({
    args,
    cwd,
    interactive,
  })
}

export const runWorktreeCliSafely = async (
  argv: string[],
  options: RunWorktreeCliSafelyOptions,
): Promise<number> => {
  try {
    return await runWorktreeCli(argv, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ;(options.stderr ?? console).error(message)
    return 1
  }
}

export const createWorktreeCliHandlers = ({
  io,
  promptForCommand,
  promptForTarget,
  services,
}: CreateWorktreeCliHandlersOptions): WorktreeCliHandlers => ({
  add: (context) => services.add(context),
  bootstrap: (context) => services.bootstrap(context),
  help: (context) => services.help(context),
  ls: async ({ cwd }) => {
    const worktrees = services.listManagedWorktrees(cwd)

    io.log('Managed worktrees:')

    if (worktrees.length === 0) {
      io.log('No managed worktrees found.')
      return 0
    }

    for (const worktree of worktrees) {
      io.log(formatWorktreeSummary(worktree))
    }

    return 0
  },
  promptForCommand,
  ps: async ({ cwd }) => {
    const processes = services.listProcesses(cwd)

    if (processes.length === 0) {
      io.log('No Vite dev servers are running.')
      return 0
    }

    io.log('Vite dev servers:')
    for (const process of processes) {
      io.log(process.summary)
    }

    return 0
  },
  remove: async (context) => {
    if (context.args.length === 0 && !context.interactive) {
      io.error('Usage: worktree remove <name-or-path>')
      return 1
    }

    const target =
      context.args.length > 0
        ? await services.resolveTarget(context)
        : await promptForTarget(context.cwd)

    if (!target) {
      return 0
    }

    if (target === context.cwd) {
      io.error('Refusing to remove the current worktree checkout.')
      return 1
    }

    return await services.remove(target)
  },
  stop: async (context) => {
    const pid = parsePidArg(context.args)

    if (pid === -1) {
      io.error('The --pid flag requires a numeric value.')
      return 1
    }

    if (pid !== null) {
      return services.stopPid(pid) ? 0 : 1
    }

    const target = context.forcePromptForTarget
      ? null
      : await services.resolveTarget(context)
    const resolvedTarget = target ?? (await promptForTarget(context.cwd))

    if (!resolvedTarget) {
      return 0
    }

    return await services.stopTarget(resolvedTarget)
  },
  up: async (context) => {
    const target = context.forcePromptForTarget
      ? null
      : await services.resolveTarget(context)
    const resolvedTarget = target ?? (await promptForTarget(context.cwd))

    if (!resolvedTarget) {
      return 0
    }

    return await services.runUp(resolvedTarget)
  },
})

export type {
  CommandSelection,
  CreateWorktreeCliHandlersOptions,
  ProcessSummary,
  RunWorktreeCliSafelyOptions,
  WorktreeCliContext,
  WorktreeCliDependencies,
  WorktreeCliHandlers,
  WorktreeCliIo,
  WorktreeCliServices,
  WorktreeSummary,
}
