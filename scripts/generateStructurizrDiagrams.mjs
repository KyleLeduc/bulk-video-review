import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const outputDir = path.resolve('docs/structurizr/diagrams')
const dotDir = path.join(outputDir, 'dot')

const workspaceCandidates = [
  process.env.STRUCTURIZR_WORKSPACE,
  'docs/structurizr/video-file-extraction.dsl',
  'docs/structurizr/video-file-processing.dsl',
  'docs/structurizr/workspaces/video-file-extraction.dsl',
].filter(Boolean)

const workspacePath = workspaceCandidates
  .map((candidate) => path.resolve(candidate))
  .find((candidate) => existsSync(candidate))

if (!workspacePath) {
  throw new Error(
    'Structurizr workspace file not found. Set STRUCTURIZR_WORKSPACE or add docs/structurizr/video-file-extraction.dsl.',
  )
}

const cliBinary =
  process.env.STRUCTURIZR_CLI ||
  process.env.STRUCTURIZR_CLI_SH ||
  'structurizr.sh'
const dotBinary = process.env.DOT_BIN || 'dot'

console.log(`Using workspace: ${workspacePath}`)
mkdirSync(outputDir, { recursive: true })
mkdirSync(dotDir, { recursive: true })

const exportArgs = [
  'export',
  '-workspace',
  workspacePath,
  '-format',
  'dot',
  '-output',
  dotDir,
]

console.log(`Exporting DOT sources to: ${dotDir}`)
const exportResult = spawnSync(cliBinary, exportArgs, { stdio: 'inherit' })

if (exportResult.error || exportResult.status !== 0) {
  const msg =
    exportResult.error?.message ||
    `Structurizr CLI exited with status ${exportResult.status}.`
  throw new Error(
    `Failed to run Structurizr CLI (${cliBinary}) for DOT export: ${msg}`,
  )
}

const dotFiles = readdirSync(dotDir).filter((file) => file.endsWith('.dot'))

if (dotFiles.length === 0) {
  throw new Error(`No DOT files found in ${dotDir}.`)
}

console.log(`Rendering PNG diagrams to: ${outputDir}`)
for (const file of dotFiles) {
  const dotPath = path.join(dotDir, file)
  const pngName = file.replace(/\.dot$/, '.png')
  const pngPath = path.join(outputDir, pngName)
  const renderArgs = ['-Tpng', dotPath, '-o', pngPath]
  const renderResult = spawnSync(dotBinary, renderArgs, { stdio: 'inherit' })

  if (renderResult.error || renderResult.status !== 0) {
    const msg =
      renderResult.error?.message ||
      `dot exited with status ${renderResult.status}. Ensure graphviz is installed.`
    throw new Error(`Failed to render PNG for ${file}: ${msg}`)
  }
}

console.log('✓ Diagrams exported successfully as PNG files.')
