import {
  findWorktreeRoot,
  getWorktreeKey,
  stopWorktreeDevServers,
} from './worktreeDev'

const worktreeRoot = findWorktreeRoot(process.cwd())
const stoppedPids = stopWorktreeDevServers(worktreeRoot)

if (stoppedPids.length === 0) {
  console.log(`No Vite dev servers found for ${getWorktreeKey(worktreeRoot)}.`)
  process.exit(0)
}

console.log(
  `Stopped Vite dev server${stoppedPids.length === 1 ? '' : 's'} for ${getWorktreeKey(worktreeRoot)}: ${stoppedPids.join(', ')}`,
)
