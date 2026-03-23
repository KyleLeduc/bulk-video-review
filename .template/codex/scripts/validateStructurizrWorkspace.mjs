import process from 'node:process'

import { findWorkspacePath, runStructurizrCli } from './structurizrHelpers.mjs'

const workspacePath = findWorkspacePath()

console.log(`Using workspace: ${workspacePath}`)
console.log('Validating workspace DSL...')
runStructurizrCli(['validate', '-workspace', workspacePath], 'validation')
console.log('✓ Workspace validated successfully.')

process.exit(0)
