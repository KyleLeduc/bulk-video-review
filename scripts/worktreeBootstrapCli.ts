import { runDefaultWorktreeCli } from './worktreeCli'

const exitCode = await runDefaultWorktreeCli([
  'bootstrap',
  ...process.argv.slice(2),
])
process.exit(exitCode)
