import { addAndBootstrapWorktree } from './worktreeBootstrap'

const [branchName, pathArg] = process.argv.slice(2)

if (!branchName) {
  console.error('Usage: npm run worktree:add -- <branch> [path]')
  process.exit(1)
}

const result = addAndBootstrapWorktree(branchName, pathArg)

console.log(
  `Created worktree ${result.worktreePath}${result.createdBranch ? ` with new branch ${branchName}` : ` for branch ${branchName}`}.`,
)

if (result.bootstrap.created.length > 0) {
  console.log(`Bootstrapped: ${result.bootstrap.created.join(', ')}`)
}

if (result.bootstrap.existing.length > 0) {
  console.log(`Already linked: ${result.bootstrap.existing.join(', ')}`)
}

if (result.bootstrap.skipped.length > 0) {
  console.log(`Skipped existing paths: ${result.bootstrap.skipped.join(', ')}`)
}
