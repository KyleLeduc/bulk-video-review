import { runDefaultWorktreeCli } from './worktreeCli'

const exitCode = await runDefaultWorktreeCli(['stop', ...process.argv.slice(2)])
process.exit(exitCode)
