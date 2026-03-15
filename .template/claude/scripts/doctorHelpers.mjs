import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ok = (label, detail) => ({ detail, label, status: 'ok' })
const warn = (label, detail) => ({ detail, label, status: 'warn' })
const fail = (label, detail) => ({ detail, label, status: 'fail' })

const defaultLocateCommand = (command) => {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return null
  }

  const resolved = result.stdout.trim()
  return resolved.length > 0 ? resolved : null
}

const evaluateCheck = (check, { locateCommand, pathExists }) => {
  if (check.type === 'command') {
    const resolved = locateCommand(check.command)

    if (resolved) {
      return ok(check.label, resolved)
    }

    return check.required
      ? fail(check.label, `Missing command: ${check.command}`)
      : warn(check.label, `Optional command not found: ${check.command}`)
  }

  const present = pathExists(check.path)

  if (present) {
    return ok(check.label, check.path)
  }

  return check.required
    ? fail(check.label, `Missing path: ${check.path}`)
    : warn(check.label, `Optional path not found: ${check.path}`)
}

export const hasFailures = (results) =>
  results.some((result) => result.status === 'fail')

export const runDoctorChecks = (
  checks,
  {
    locateCommand = defaultLocateCommand,
    pathExists = existsSync,
  } = {},
) => checks.map((check) => evaluateCheck(check, { locateCommand, pathExists }))

export const getDiagramDoctorResults = (deps) =>
  runDoctorChecks(
    [
      {
        command: 'structurizr',
        label: 'Structurizr CLI',
        required: true,
        type: 'command',
      },
      {
        command: 'dot',
        label: 'Graphviz dot',
        required: true,
        type: 'command',
      },
      {
        command: 'java',
        label: 'Java runtime',
        required: true,
        type: 'command',
      },
      {
        label: 'Structurizr workspace DSL',
        path: 'docs/structurizr/workspace.dsl',
        required: true,
        type: 'path',
      },
    ],
    deps,
  )

export const getAgentDoctorResults = (deps) =>
  runDoctorChecks(
    [
      {
        command: 'node',
        label: 'Node.js',
        required: true,
        type: 'command',
      },
      {
        command: 'git',
        label: 'Git',
        required: true,
        type: 'command',
      },
      {
        command: 'structurizr',
        label: 'Structurizr CLI',
        required: true,
        type: 'command',
      },
      {
        command: 'dot',
        label: 'Graphviz dot',
        required: true,
        type: 'command',
      },
      {
        command: 'java',
        label: 'Java runtime',
        required: true,
        type: 'command',
      },
      {
        label: 'Repository guidance',
        path: 'CLAUDE.md',
        required: true,
        type: 'path',
      },
      {
        label: 'Devcontainer config',
        path: '.devcontainer/devcontainer.json',
        required: true,
        type: 'path',
      },
      {
        label: 'Devcontainer Dockerfile',
        path: '.devcontainer/Dockerfile',
        required: true,
        type: 'path',
      },
      {
        label: 'Structurizr workspace DSL',
        path: 'docs/structurizr/workspace.dsl',
        required: true,
        type: 'path',
      },
      {
        label: 'Bundled Claude skills',
        path: '.claude/skills',
        required: true,
        type: 'path',
      },
    ],
    deps,
  )

export const printDoctorReport = (title, results) => {
  console.log(title)

  for (const result of results) {
    console.log(`[${result.status}] ${result.label}: ${result.detail}`)
  }

  if (hasFailures(results)) {
    console.log('Doctor checks failed.')
    return 1
  }

  console.log('Doctor checks passed.')
  return 0
}
