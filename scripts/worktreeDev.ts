import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'

export const ROOT_DEV_PORT = 5173
const MAX_PORT_SCAN = 200

export type ViteServerProcess = {
  pid: number
  cwd: string
  cmd: string
  ports: number[]
}

type PortSelectionOptions = {
  worktreeRoot: string
  activeServers: ViteServerProcess[]
}

type PortSelection = {
  alreadyRunning: boolean
  port: number
}

type WorktreeMetadata = {
  workspaceRoot: string
  worktreeKey: string
}

const LINKED_WORKTREE_SEGMENT = `${sep}worktrees${sep}`
const LEGACY_WORKTREE_SEGMENTS = [
  `${sep}.worktrees${sep}`,
  `${sep}worktrees${sep}`,
]

const hashString = (value: string): number => {
  let hash = 0

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

const isViteCommand = (command: string): boolean =>
  command.includes('/node_modules/.bin/vite') ||
  command.includes('/node_modules/vite/bin/vite')

const parseListeningSockets = (): Map<string, number> => {
  const sockets = new Map<string, number>()

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!existsSync(file)) {
      continue
    }

    const lines = readFileSync(file, 'utf8').trim().split('\n').slice(1)

    for (const line of lines) {
      const parts = line.trim().split(/\s+/)

      if (parts[3] !== '0A') {
        continue
      }

      const [, portHex] = parts[1].split(':')
      const inode = parts[9]
      sockets.set(inode, Number.parseInt(portHex, 16))
    }
  }

  return sockets
}

const readCommand = (pid: string): string => {
  const contents = readFileSync(`/proc/${pid}/cmdline`)
  return contents.toString('utf8').replace(/\0/g, ' ').trim()
}

const readProcessPorts = (
  pid: string,
  listeningSockets: Map<string, number>,
): number[] => {
  const fdRoot = `/proc/${pid}/fd`
  const ports = new Set<number>()

  for (const descriptor of readdirSync(fdRoot)) {
    let target = ''

    try {
      target = readlinkSync(join(fdRoot, descriptor))
    } catch {
      continue
    }

    const match = /^socket:\[(\d+)\]$/.exec(target)

    if (!match) {
      continue
    }

    const port = listeningSockets.get(match[1])

    if (port) {
      ports.add(port)
    }
  }

  return [...ports].sort((left, right) => left - right)
}

export const getWorkspaceRoot = (worktreeRoot: string): string => {
  const metadata = readWorktreeMetadata(worktreeRoot)

  if (metadata) {
    return metadata.workspaceRoot
  }

  for (const segment of LEGACY_WORKTREE_SEGMENTS) {
    const markerIndex = worktreeRoot.indexOf(segment)

    if (markerIndex !== -1) {
      return worktreeRoot.slice(0, markerIndex)
    }
  }

  return worktreeRoot
}

export const getWorktreeKey = (worktreeRoot: string): string => {
  const metadata = readWorktreeMetadata(worktreeRoot)

  if (metadata) {
    return metadata.worktreeKey
  }

  for (const segment of LEGACY_WORKTREE_SEGMENTS) {
    const markerIndex = worktreeRoot.indexOf(segment)

    if (markerIndex !== -1) {
      return (
        worktreeRoot.slice(markerIndex + segment.length).split(sep)[0] || 'main'
      )
    }
  }

  return 'main'
}

export const findWorktreeRoot = (cwd: string): string => {
  let current = resolve(cwd)

  while (!existsSync(join(current, '.git'))) {
    const parent = dirname(current)

    if (parent === current) {
      throw new Error(`Unable to locate a git worktree root from ${cwd}`)
    }

    current = parent
  }

  return current
}

const readWorktreeMetadata = (
  worktreeRoot: string,
): WorktreeMetadata | null => {
  const gitEntry = join(worktreeRoot, '.git')

  if (!existsSync(gitEntry)) {
    return null
  }

  try {
    if (lstatSync(gitEntry).isDirectory()) {
      return {
        workspaceRoot: worktreeRoot,
        worktreeKey: 'main',
      }
    }
  } catch {
    return null
  }

  try {
    const pointer = readFileSync(gitEntry, 'utf8').trim()
    const match = /^gitdir:\s*(.+)$/.exec(pointer)

    if (!match) {
      return null
    }

    const gitDir = resolve(worktreeRoot, match[1])
    const markerIndex = gitDir.lastIndexOf(LINKED_WORKTREE_SEGMENT)

    if (markerIndex === -1) {
      return {
        workspaceRoot: worktreeRoot,
        worktreeKey: 'main',
      }
    }

    return {
      workspaceRoot: dirname(gitDir.slice(0, markerIndex)),
      worktreeKey: basename(gitDir),
    }
  } catch {
    return null
  }
}

export const listViteProcesses = (): ViteServerProcess[] => {
  const listeningSockets = parseListeningSockets()
  const processes: ViteServerProcess[] = []

  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) {
      continue
    }

    try {
      const cmd = readCommand(entry)

      if (!isViteCommand(cmd)) {
        continue
      }

      const cwd = readlinkSync(`/proc/${entry}/cwd`)
      const ports = readProcessPorts(entry, listeningSockets)

      processes.push({
        pid: Number.parseInt(entry, 10),
        cwd,
        cmd,
        ports,
      })
    } catch {
      continue
    }
  }

  return processes.sort((left, right) => {
    const leftPort = left.ports[0] ?? Number.MAX_SAFE_INTEGER
    const rightPort = right.ports[0] ?? Number.MAX_SAFE_INTEGER

    return leftPort - rightPort || left.pid - right.pid
  })
}

export const getStopTargetPids = (
  processes: ViteServerProcess[],
  worktreeRoot: string,
): number[] =>
  processes
    .filter((process) => process.cwd === worktreeRoot)
    .map((process) => process.pid)
    .sort((left, right) => left - right)

export const pickWorktreePort = ({
  worktreeRoot,
  activeServers,
}: PortSelectionOptions): PortSelection => {
  const existingPorts = activeServers
    .filter((process) => process.cwd === worktreeRoot)
    .flatMap((process) => process.ports)
    .sort((left, right) => left - right)

  if (existingPorts.length > 0) {
    return {
      alreadyRunning: true,
      port: existingPorts[0],
    }
  }

  if (worktreeRoot === getWorkspaceRoot(worktreeRoot)) {
    return {
      alreadyRunning: false,
      port: ROOT_DEV_PORT,
    }
  }

  const occupiedPorts = new Set(
    activeServers.flatMap((process) => process.ports).filter(Boolean),
  )
  const preferredPort =
    ROOT_DEV_PORT +
    1 +
    (hashString(getWorktreeKey(worktreeRoot)) % MAX_PORT_SCAN)

  let port = preferredPort

  while (occupiedPorts.has(port)) {
    port += 1
  }

  return {
    alreadyRunning: false,
    port,
  }
}

export const formatProcessSummary = (
  process: ViteServerProcess,
  currentWorktreeRoot?: string,
): string => {
  const currentMarker = process.cwd === currentWorktreeRoot ? '*' : ' '
  const portLabel =
    process.ports.length > 0 ? process.ports.join(',') : 'no-listener'

  return `${currentMarker} ${portLabel}\tpid=${process.pid}\t${getWorktreeKey(process.cwd)}\t${process.cwd}`
}

type ResolveViteBinOptions = {
  existsSync?: (path: string) => boolean
  resolveModulePath?: (specifier: string) => string
}

export const resolveViteBin = (
  worktreeRoot: string,
  options: ResolveViteBinOptions = {},
): string => {
  const fileExists = options.existsSync ?? existsSync
  const localViteBin = resolve(worktreeRoot, 'node_modules/vite/bin/vite.js')
  const workspaceRoot = getWorkspaceRoot(worktreeRoot)
  const workspaceViteBin = resolve(
    workspaceRoot,
    'node_modules/vite/bin/vite.js',
  )

  if (fileExists(localViteBin)) {
    return localViteBin
  }

  if (workspaceRoot !== worktreeRoot && fileExists(workspaceViteBin)) {
    return workspaceViteBin
  }

  const packageRoots = [worktreeRoot]

  if (workspaceRoot !== worktreeRoot) {
    packageRoots.push(workspaceRoot)
  }

  for (const packageRoot of packageRoots) {
    try {
      const resolveModulePath =
        options.resolveModulePath ??
        ((specifier: string) =>
          createRequire(join(packageRoot, 'package.json')).resolve(specifier))

      const vitePackagePath = resolveModulePath('vite/package.json')
      const resolvedViteBin = resolve(dirname(vitePackagePath), 'bin/vite.js')

      if (fileExists(resolvedViteBin)) {
        return resolvedViteBin
      }
    } catch {
      continue
    }
  }

  throw new Error(`Unable to find Vite for ${worktreeRoot}`)
}

export const runWorktreeDevServer = async (
  cwd = process.cwd(),
): Promise<number> => {
  const worktreeRoot = findWorktreeRoot(cwd)
  const selection = pickWorktreePort({
    worktreeRoot,
    activeServers: listViteProcesses(),
  })

  if (selection.alreadyRunning) {
    console.log(
      `Vite is already running for ${getWorktreeKey(worktreeRoot)} at http://127.0.0.1:${selection.port}/`,
    )
    return 0
  }

  const viteBin = resolveViteBin(worktreeRoot)

  const child = spawn(
    process.execPath,
    [
      viteBin,
      '--host',
      '127.0.0.1',
      '--port',
      String(selection.port),
      '--strictPort',
    ],
    {
      cwd: worktreeRoot,
      stdio: 'inherit',
    },
  )

  return await new Promise<number>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolvePromise(code ?? 0))
  })
}

export const stopWorktreeDevServers = (cwd = process.cwd()): number[] => {
  const worktreeRoot = findWorktreeRoot(cwd)
  const targetPids = getStopTargetPids(listViteProcesses(), worktreeRoot)

  for (const pid of targetPids) {
    process.kill(pid, 'SIGTERM')
  }

  return targetPids
}
