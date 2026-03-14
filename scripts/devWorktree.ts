import { createInterface } from 'node:readline/promises'
import {
  parseManagedWorktreeSelection,
  resolveWorktreeDevTarget,
  runWorktreeDevServer,
  type ManagedWorktreeChoice,
} from './worktreeDev'

const promptForChoice = async (
  choices: ManagedWorktreeChoice[],
): Promise<ManagedWorktreeChoice | null> => {
  console.log('Available worktrees:')

  for (const [index, choice] of choices.entries()) {
    const status = choice.alreadyRunning
      ? `already running at http://127.0.0.1:${choice.port}/`
      : `will start at http://127.0.0.1:${choice.port}/`

    console.log(`${index + 1}. ${choice.name}  ${status}`)
    console.log(`   ${choice.path}`)
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    for (;;) {
      const answer = (
        await readline.question('Select a worktree number (blank to cancel): ')
      ).trim()
      const selection = parseManagedWorktreeSelection(answer, choices.length)

      if (selection === null) {
        return null
      }

      if (selection !== -1) {
        return choices[selection]
      }

      console.error(
        `Invalid selection "${answer}". Enter a number from 1 to ${choices.length}.`,
      )
    }
  } finally {
    readline.close()
  }
}

try {
  const [targetArg] = process.argv.slice(2)
  const targetWorktreeRoot = await resolveWorktreeDevTarget({
    cwd: process.cwd(),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    promptForChoice,
    targetArg,
  })

  if (!targetWorktreeRoot) {
    console.log('No worktree selected.')
    process.exit(0)
  }

  const exitCode = await runWorktreeDevServer(targetWorktreeRoot)
  process.exit(exitCode)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
