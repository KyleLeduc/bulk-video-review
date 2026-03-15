import { runDefaultWorktreeCli } from './worktreeCli'

const exitCode = await runDefaultWorktreeCli(['add', ...process.argv.slice(2)])
process.exit(exitCode)
