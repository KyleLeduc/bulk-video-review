import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { findWorkspacePath, runStructurizrCli } from './structurizrHelpers.mjs'

const outputDir = path.resolve('docs/structurizr/diagrams')
const dotDir = path.join(outputDir, 'dot')
const workspacePath = findWorkspacePath()
const dotBinary = process.env.DOT_BIN || 'dot'

console.log(`Using workspace: ${workspacePath}`)
console.log('Validating workspace DSL...')
runStructurizrCli(['validate', '-workspace', workspacePath], 'validation')

mkdirSync(outputDir, { recursive: true })
mkdirSync(dotDir, { recursive: true })

console.log(`Exporting DOT sources to: ${dotDir}`)
runStructurizrCli(
  ['export', '-workspace', workspacePath, '-format', 'dot', '-output', dotDir],
  'DOT export',
)

const dotFiles = readdirSync(dotDir).filter((file) => file.endsWith('.dot'))

if (dotFiles.length === 0) {
  throw new Error(`No DOT files found in ${dotDir}.`)
}

console.log(`Rendering PNG diagrams to: ${outputDir}`)
for (const file of dotFiles) {
  const dotPath = path.join(dotDir, file)
  const pngPath = path.join(outputDir, file.replace(/\.dot$/, '.png'))
  const renderArgs = ['-Tpng', dotPath, '-o', pngPath]
  const renderResult = spawnSync(dotBinary, renderArgs, { stdio: 'inherit' })

  if (renderResult.error || renderResult.status !== 0) {
    const msg =
      renderResult.error?.message ||
      `dot exited with status ${renderResult.status}. Ensure graphviz is installed.`
    throw new Error(`Failed to render PNG for ${file}: ${msg}`)
  }
}

console.log('✓ Workspace validated and diagrams rendered successfully.')
