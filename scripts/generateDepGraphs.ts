import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

console.log(path.resolve(__dirname, './test'))

const graphCommandFactory = (focus: string) => {
  return `depcruise src --include-only "^src" --focus ${focus} --output-type dot | dot -T svg > ./dep-graphs/${focus}-graph.svg`
}
// "npx depcruise src --include-only ${rootDir} --focus ${focuses[0]} --output-type dot | npx graphviz -Tsvg -o ${outputDir}/${focuses[0]}-graph.svg"

const outputDir = './dep-graphs'

async function generateDepGraphs(commands) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  try {
    // Execute all commands in parallel
    const promises = commands.map(async (focus) => {
      const command = graphCommandFactory(focus)

      await execAsync(command)

      console.log(`Command executed successfully: ${command}`)
    })

    // Wait for all commands to complete
    await Promise.all(promises)

    console.log('All dependency graphs generated successfully')
  } catch (error) {
    console.error(`Error generating dependency graph`, error)

    process.exit(1)
  }
}

const commands = ['components', 'stores', 'videosStore', 'services']

generateDepGraphs(commands)
