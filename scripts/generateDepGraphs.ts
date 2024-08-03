import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const graphCommandFactory = (focus: string) => {
  return `depcruise src --include-only "^src" --focus ${focus} --output-type dot | dot -T svg > ./dep-graphs/${focus}-graph.svg`
}

async function generateDepGraphs(commands) {
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
    console.error('Error generating dependency graphs:', error)

    process.exit(1)
  }
}

const commands = ['components', 'stores', 'videosStore', 'services']

generateDepGraphs(commands)
