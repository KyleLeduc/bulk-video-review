import { runDefaultWorktreeCli } from './worktreeCli'

const exitCode = await runDefaultWorktreeCli(process.argv.slice(2))
process.exit(exitCode)
