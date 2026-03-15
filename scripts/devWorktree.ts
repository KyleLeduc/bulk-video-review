import { runDefaultWorktreeCli } from './worktreeCli'

const exitCode = await runDefaultWorktreeCli(['up', ...process.argv.slice(2)])
process.exit(exitCode)
