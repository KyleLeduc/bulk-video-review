import { runWorktreeDevServer } from './worktreeDev'

const exitCode = await runWorktreeDevServer()
process.exit(exitCode)
