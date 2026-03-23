import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const workspaceCandidates = [
  process.env.STRUCTURIZR_WORKSPACE,
  'docs/structurizr/workspace.dsl',
  'docs/structurizr/system.dsl',
].filter(Boolean)

export const findWorkspacePath = () => {
  const workspacePath = workspaceCandidates
    .map((candidate) => path.resolve(candidate))
    .find((candidate) => existsSync(candidate))

  if (!workspacePath) {
    throw new Error(
      'Structurizr workspace file not found. Set STRUCTURIZR_WORKSPACE or add docs/structurizr/workspace.dsl.',
    )
  }

  return workspacePath
}

export const getCliBinary = () =>
  process.env.STRUCTURIZR_CLI ||
  process.env.STRUCTURIZR_CLI_SH ||
  'structurizr'

export const runStructurizrCli = (args, contextLabel) => {
  const result = spawnSync(getCliBinary(), args, { stdio: 'inherit' })

  if (result.error || result.status !== 0) {
    const msg =
      result.error?.message ||
      `Structurizr CLI exited with status ${result.status}.`
    throw new Error(`Failed during ${contextLabel}: ${msg}`)
  }
}
