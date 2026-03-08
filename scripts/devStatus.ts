import {
  findWorktreeRoot,
  formatProcessSummary,
  listViteProcesses,
} from './worktreeDev'

const currentWorktreeRoot = findWorktreeRoot(process.cwd())
const processes = listViteProcesses()

if (processes.length === 0) {
  console.log('No Vite dev servers are running.')
  process.exit(0)
}

console.log('Vite dev servers:')
for (const processInfo of processes) {
  console.log(formatProcessSummary(processInfo, currentWorktreeRoot))
}
