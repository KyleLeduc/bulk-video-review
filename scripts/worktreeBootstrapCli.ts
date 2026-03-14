import { bootstrapCurrentOrSpecifiedWorktree } from './worktreeBootstrap'

const [pathArg] = process.argv.slice(2)
const result = bootstrapCurrentOrSpecifiedWorktree(pathArg)

console.log(`Bootstrapped worktree ${result.worktreePath}.`)

if (result.bootstrap.created.length > 0) {
  console.log(`Linked: ${result.bootstrap.created.join(', ')}`)
}

if (result.bootstrap.existing.length > 0) {
  console.log(`Already linked: ${result.bootstrap.existing.join(', ')}`)
}

if (result.bootstrap.skipped.length > 0) {
  console.log(`Skipped existing paths: ${result.bootstrap.skipped.join(', ')}`)
}
