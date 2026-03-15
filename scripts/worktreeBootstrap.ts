import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { findWorktreeRoot, getWorkspaceRoot } from './worktreeDev'

export type BootstrapResult = {
  created: string[]
  existing: string[]
  skipped: string[]
}

type BootstrapLink = {
  name: string
  sourcePath: string
  linkPath: string
}

type WorktreeAddArgsOptions = {
  branchExists: boolean
  branchName: string
  worktreePath: string
}

const isSharedEnvFileName = (name: string): boolean =>
  name === '.env' || name.startsWith('.env.')

const getRelativeSymlinkTarget = (
  linkPath: string,
  sourcePath: string,
): string => relative(dirname(linkPath), sourcePath)

const isMatchingSymlink = (linkPath: string, sourcePath: string): boolean => {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) {
      return false
    }

    return resolve(dirname(linkPath), readlinkSync(linkPath)) === sourcePath
  } catch {
    return false
  }
}

const getBootstrapLinks = (
  worktreeRoot: string,
  workspaceRoot: string,
): BootstrapLink[] => {
  if (worktreeRoot === workspaceRoot) {
    return []
  }

  const links: BootstrapLink[] = []
  const nodeModulesPath = join(workspaceRoot, 'node_modules')

  if (existsSync(nodeModulesPath)) {
    links.push({
      linkPath: join(worktreeRoot, 'node_modules'),
      name: 'node_modules',
      sourcePath: nodeModulesPath,
    })
  }

  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() || !isSharedEnvFileName(entry.name)) {
      continue
    }

    links.push({
      linkPath: join(worktreeRoot, entry.name),
      name: entry.name,
      sourcePath: join(workspaceRoot, entry.name),
    })
  }

  return links.sort((left, right) => left.name.localeCompare(right.name))
}

export const bootstrapWorktree = (
  worktreeRoot: string,
  workspaceRoot = getWorkspaceRoot(worktreeRoot),
): BootstrapResult => {
  const result: BootstrapResult = {
    created: [],
    existing: [],
    skipped: [],
  }

  for (const link of getBootstrapLinks(worktreeRoot, workspaceRoot)) {
    if (!existsSync(link.linkPath)) {
      symlinkSync(
        getRelativeSymlinkTarget(link.linkPath, link.sourcePath),
        link.linkPath,
      )
      result.created.push(link.name)
      continue
    }

    if (isMatchingSymlink(link.linkPath, link.sourcePath)) {
      result.existing.push(link.name)
      continue
    }

    result.skipped.push(link.name)
  }

  return result
}

const sanitizeBranchName = (branchName: string): string =>
  branchName.replace(/[\\/]+/g, '-')

export const getDefaultWorktreePath = (
  workspaceRoot: string,
  branchName: string,
): string => join(workspaceRoot, '.worktrees', sanitizeBranchName(branchName))

export const buildWorktreeAddArgs = ({
  branchExists,
  branchName,
  worktreePath,
}: WorktreeAddArgsOptions): string[] =>
  branchExists
    ? ['worktree', 'add', worktreePath, branchName]
    : ['worktree', 'add', '-b', branchName, worktreePath]

export const buildWorktreeRemoveArgs = (worktreePath: string): string[] => [
  'worktree',
  'remove',
  worktreePath,
]

const resolveWorktreePath = (
  workspaceRoot: string,
  pathArg?: string,
  branchName?: string,
): string => {
  if (pathArg) {
    return isAbsolute(pathArg) ? pathArg : resolve(workspaceRoot, pathArg)
  }

  if (!branchName) {
    throw new Error(
      'A branch name is required when no worktree path is provided.',
    )
  }

  return getDefaultWorktreePath(workspaceRoot, branchName)
}

const gitExec = (workspaceRoot: string, args: string[]): void => {
  execFileSync('git', args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
  })
}

const hasLocalBranch = (workspaceRoot: string, branchName: string): boolean => {
  try {
    execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`],
      {
        cwd: workspaceRoot,
        stdio: 'ignore',
      },
    )
    return true
  } catch {
    return false
  }
}

export const addAndBootstrapWorktree = (
  branchName: string,
  pathArg?: string,
  cwd = process.cwd(),
): {
  bootstrap: BootstrapResult
  createdBranch: boolean
  worktreePath: string
} => {
  const workspaceRoot = getWorkspaceRoot(findWorktreeRoot(cwd))
  const worktreePath = resolveWorktreePath(workspaceRoot, pathArg, branchName)
  const branchExists = hasLocalBranch(workspaceRoot, branchName)

  gitExec(
    workspaceRoot,
    buildWorktreeAddArgs({
      branchExists,
      branchName,
      worktreePath,
    }),
  )

  return {
    bootstrap: bootstrapWorktree(worktreePath, workspaceRoot),
    createdBranch: !branchExists,
    worktreePath,
  }
}

export const bootstrapCurrentOrSpecifiedWorktree = (
  pathArg?: string,
  cwd = process.cwd(),
): {
  bootstrap: BootstrapResult
  worktreePath: string
  workspaceRoot: string
} => {
  const currentWorktreeRoot = findWorktreeRoot(cwd)
  const workspaceRoot = getWorkspaceRoot(currentWorktreeRoot)
  const worktreePath = pathArg
    ? resolveWorktreePath(workspaceRoot, pathArg)
    : currentWorktreeRoot

  return {
    bootstrap: bootstrapWorktree(worktreePath, workspaceRoot),
    worktreePath,
    workspaceRoot,
  }
}

export const removeWorktree = (
  pathArg: string,
  cwd = process.cwd(),
): {
  worktreePath: string
  workspaceRoot: string
} => {
  const workspaceRoot = getWorkspaceRoot(findWorktreeRoot(cwd))
  const worktreePath = resolveWorktreePath(workspaceRoot, pathArg)

  gitExec(workspaceRoot, buildWorktreeRemoveArgs(worktreePath))

  return {
    worktreePath,
    workspaceRoot,
  }
}
