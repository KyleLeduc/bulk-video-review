import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SuiteOptions, SuiteDependencies } from './runVideoBenchmarkSuite'
const runVideoBenchmarkSuite = async (
  options: SuiteOptions,
  dependencies: SuiteDependencies,
) =>
  (await import('./runVideoBenchmarkSuite')).runVideoBenchmarkSuite(
    options,
    dependencies,
  )
afterEach(() => vi.resetModules())
import type { HostOptions, TrialResult } from './videoBenchmarkHost'
import { createCustomSelection } from '../shared/benchmark/videoBenchmarkProtocol'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const setup = () => {
  const log: string[] = []
  const options: SuiteOptions = {
    files: [],
    configurations: [{ backend: 'dom', foreground: 2, previews: 1 }],
    repetitions: 2,
    includeCached: true,
    build: {
      revision: 'a'.repeat(40),
      assetsSha256: 'b'.repeat(64),
      dirty: false,
    },
    mount: document.createElement('div'),
    stopRequested: () => false,
  }
  const hosts: HostOptions[] = []
  const dependencies: SuiteDependencies = {
    lock: async (run) => run(),
    deletePair: vi.fn(async () => {
      log.push('delete')
    }),
    createHost: vi.fn(async (host) => {
      hosts.push(host)
      log.push('create')
      return {
        run: vi.fn(async (files) => {
          expect(files).toEqual(options.files)
          log.push('run')
          return {
            row: {
              configuration: host.configuration,
              status: 'passed',
              cleanup: 'pending',
              hidden: false,
              wallMs: 1,
              build: options.build,
              report: {},
              outputs: { valid: true, videos: 7, frames: 63, errors: [] },
              errors: [],
            },
            images: [],
          } as TrialResult
        }),
        close: async () => {
          log.push('close')
        },
      }
    }),
  }
  return { options, dependencies, log, hosts }
}

describe('serial benchmark suite', () => {
  test('passes one immutable custom selection through fresh/cached hosts and keeps distinct evidence', async () => {
    const { options, dependencies, hosts } = setup()
    options.files = [new File(['clip'], 'private.mp4')]
    options.selection = createCustomSelection(options.files)
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.mode).toBe('pipeline-custom-files-v1')
    expect(result.fixture).toMatchObject({
      ...options.selection,
      verification: 'selection-only',
    })
    expect(
      hosts.every((host) => host.selection?.id === options.selection?.id),
    ).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private.mp4')
  })
  test.each(['onImages', 'onRow'] as const)(
    'retains evidence and halts safely if %s fails',
    async (callback) => {
      const { options, dependencies } = setup()
      let calls = 0
      options[callback] = () => {
        if (++calls > (callback === 'onImages' ? 1 : 0))
          throw new Error('UI failed')
      }
      const result = await runVideoBenchmarkSuite(options, dependencies)
      expect(result.status).toBe('failed')
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].status).toBe('failed')
      expect(dependencies.deletePair).toHaveBeenCalledOnce()
    },
  )
  test('retains a failed trial and closes its host before deleting its database', async () => {
    const { options, dependencies, log } = setup()
    dependencies.createHost = async () => ({
      run: async () => {
        throw new Error('Trial result deadline exceeded')
      },
      close: async () => {
        log.push('close')
      },
    })
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.status).toBe('failed')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].errors).toContain('Trial result deadline exceeded')
    expect(log).toEqual(['close', 'delete'])
  })

  test('marks a hidden-document trial invalid and stops admitting work', async () => {
    const { options, dependencies } = setup()
    const create = dependencies.createHost
    dependencies.createHost = async (options) => {
      const host = await create(options)
      const run = host.run
      host.run = async (files) => {
        const result = await run(files)
        result.row.hidden = true
        return result
      }
      return host
    }
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.status).toBe('failed')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].errors).toContain('Document became hidden')
  })
  test('pairs fresh/cached storage with separate hosts and awaits cleanup before advancing', async () => {
    const { options, dependencies, log, hosts } = setup()
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.status).toBe('completed')
    expect(log).toEqual([
      'create',
      'run',
      'close',
      'create',
      'run',
      'close',
      'delete',
      'create',
      'run',
      'close',
      'create',
      'run',
      'close',
      'delete',
    ])
    expect(hosts[0].pairId).toBe(hosts[1].pairId)
    expect(hosts[0].trialId).not.toBe(hosts[1].trialId)
    expect(hosts[1].pairId).not.toBe(hosts[2].pairId)
  })
  test('Stop lets an admitted trial settle but prevents the next trial', async () => {
    const { options, dependencies } = setup()
    let stopped = false
    options.stopRequested = () => stopped
    options.onRow = () => {
      stopped = true
    }
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.status).toBe('interrupted')
    expect(result.rows).toHaveLength(1)
    expect(dependencies.deletePair).toHaveBeenCalledOnce()
  })
  test('cleanup failure retains the row and owned orphan ID and halts admission', async () => {
    const { options, dependencies } = setup()
    dependencies.deletePair = async () => {
      throw new Error('blocked')
    }
    const result = await runVideoBenchmarkSuite(options, dependencies)
    expect(result.cleanup).toBe('failed')
    expect(result.orphanedPairs).toHaveLength(1)
    expect(result.rows).toHaveLength(2)
    expect(result.status).toBe('failed')
    await expect(runVideoBenchmarkSuite(options, dependencies)).rejects.toThrow(
      /reload/i,
    )
  })
  test('awaits deferred cleanup and rejects a second concurrent Start', async () => {
    const { options, dependencies } = setup()
    const cleanup = deferred()
    dependencies.deletePair = vi.fn(() => cleanup.promise)
    const run = runVideoBenchmarkSuite(options, dependencies)
    await vi.waitFor(() =>
      expect(dependencies.deletePair).toHaveBeenCalledOnce(),
    )
    expect(dependencies.createHost).toHaveBeenCalledTimes(2)
    await expect(runVideoBenchmarkSuite(options, dependencies)).rejects.toThrow(
      /active/,
    )
    cleanup.resolve()
    await run
  })
  test('does not create a host if another tab owns the lock', async () => {
    const { options, dependencies } = setup()
    dependencies.lock = async () => {
      throw new Error('Another benchmark is active')
    }
    await expect(runVideoBenchmarkSuite(options, dependencies)).rejects.toThrow(
      /active/,
    )
    expect(dependencies.createHost).not.toHaveBeenCalled()
  })
})
