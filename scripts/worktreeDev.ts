import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

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

const WORKTREE_SEGMENT = `${sep}.worktrees${sep}`

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
  const markerIndex = worktreeRoot.indexOf(WORKTREE_SEGMENT)

  if (markerIndex === -1) {
    return worktreeRoot
  }

  return worktreeRoot.slice(0, markerIndex)
}

export const getWorktreeKey = (worktreeRoot: string): string => {
  const markerIndex = worktreeRoot.indexOf(WORKTREE_SEGMENT)

  if (markerIndex === -1) {
    return 'main'
  }

  return (
    worktreeRoot.slice(markerIndex + WORKTREE_SEGMENT.length).split(sep)[0] ||
    'main'
  )
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

  const viteBin = resolve(worktreeRoot, 'node_modules/vite/bin/vite.js')

  if (!existsSync(viteBin)) {
    throw new Error(`Unable to find Vite at ${viteBin}`)
  }

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
