import type {
  BuildIdentity,
  Configuration,
} from '../shared/benchmark/videoBenchmarkProtocol'
import type { HostOptions, TrialHost, TrialRow } from './videoBenchmarkHost'
import { createTrialHost, limits } from './videoBenchmarkHost'
import { enumerateTrialPairs } from '../shared/benchmark/videoBenchmarkProtocol'
import reference from '../shared/benchmark/referenceFixtures.json'
import { DatabaseConnection } from '../infrastructure/database/DatabaseConnection'

export interface SuiteOptions {
  files: File[]
  configurations: Configuration[]
  repetitions: number
  includeCached: boolean
  build: BuildIdentity
  mount: HTMLElement
  stopRequested(): boolean
  onRow?(row: TrialRow): void
  onImages?(images: Blob[]): void
}
export interface SuiteDependencies {
  lock: (run: () => Promise<BenchmarkSuite>) => Promise<BenchmarkSuite>
  createHost: (options: HostOptions) => Promise<TrialHost>
  deletePair: (pairId: string) => Promise<void>
}
export interface BenchmarkSuite {
  protocolVersion: 2
  mode: 'pipeline-no-gallery-v1'
  status: 'completed' | 'interrupted' | 'failed'
  cleanup: 'complete' | 'failed'
  settings: Pick<
    SuiteOptions,
    'configurations' | 'repetitions' | 'includeCached'
  >
  fixture: { id: string; verification: 'selection-only' }
  identity: { build: BuildIdentity; userAgent: string; cacheScope: string }
  limits: { startupMs: number; trialMs: number; cleanupMs: number }
  rows: TrialRow[]
  errors: string[]
  orphanedPairs: string[]
}
let active = false
const defaults: SuiteDependencies = {
  createHost: createTrialHost,
  deletePair: (pairId) => DatabaseConnection.deleteBenchmark(pairId),
  lock: (run) =>
    navigator.locks.request(
      'bvr-video-benchmark-v1',
      { ifAvailable: true },
      (lock) => {
        if (!lock)
          throw new Error('Another benchmark is active in this browser')
        return run()
      },
    ),
}
export async function runVideoBenchmarkSuite(
  options: SuiteOptions,
  dependencies = defaults,
): Promise<BenchmarkSuite> {
  if (active) throw new Error('A benchmark is already active')
  const settings = {
    configurations: options.configurations.map((value) => ({ ...value })),
    repetitions: options.repetitions,
    includeCached: options.includeCached,
  }
  const pairs = enumerateTrialPairs(
    settings.configurations,
    settings.repetitions,
  )
  active = true
  try {
    return await dependencies.lock(async () => {
      const suiteId = crypto.randomUUID()
      const suite: BenchmarkSuite = {
        protocolVersion: 2,
        mode: 'pipeline-no-gallery-v1',
        status: 'completed',
        cleanup: 'complete',
        settings,
        fixture: { id: reference.id, verification: 'selection-only' },
        identity: {
          build: { ...options.build },
          userAgent: navigator.userAgent,
          cacheScope:
            'fresh pair database; fresh host each trial; shared browser and OS caches',
        },
        limits: { ...limits },
        rows: [],
        errors: [],
        orphanedPairs: [],
      }
      for (const pair of pairs) {
        if (options.stopRequested()) {
          suite.status = 'interrupted'
          break
        }
        const pairId = crypto.randomUUID()
        try {
          for (const cache of settings.includeCached
            ? (['cold', 'warm'] as const)
            : (['cold'] as const)) {
            if (options.stopRequested()) {
              suite.status = 'interrupted'
              break
            }
            options.onImages?.([])
            const configuration = { ...pair, cache }
            let host: TrialHost | null = null
            let hidden = document.hidden
            const visibility = () => {
              hidden ||= document.hidden
            }
            document.addEventListener('visibilitychange', visibility)
            let row: TrialRow = {
              configuration,
              status: 'failed',
              cleanup: 'pending',
              hidden,
              wallMs: null,
              build: { ...options.build },
              report: null,
              outputs: null,
              errors: [],
            }
            try {
              host = await dependencies.createHost({
                suiteId,
                pairId,
                trialId: crypto.randomUUID(),
                configuration,
                build: options.build,
                mount: options.mount,
              })
              const result = await host.run(options.files)
              row = result.row
              row.hidden ||= hidden
              if (row.hidden) {
                row.status = 'failed'
                row.errors.push('Document became hidden')
              }
              options.onImages?.(result.images)
            } catch (error) {
              row.errors.push(
                error instanceof Error ? error.message : 'Trial failed',
              )
            } finally {
              document.removeEventListener('visibilitychange', visibility)
              try {
                await host?.close()
                row.cleanup = 'complete'
              } catch {
                row.cleanup = 'failed'
                row.status = 'failed'
                row.errors.push('Host cleanup failed or exceeded deadline')
              }
            }
            suite.rows.push(row)
            options.onRow?.(row)
            if (row.status !== 'passed') {
              suite.status = 'failed'
              break
            }
          }
        } finally {
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              dependencies.deletePair(pairId),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('Deletion deadline exceeded')),
                  limits.cleanupMs,
                )
              }),
            ])
          } catch {
            suite.status = 'failed'
            suite.cleanup = 'failed'
            suite.orphanedPairs.push(pairId)
            suite.errors.push(
              'Owned benchmark database cleanup unresolved; no further trials admitted',
            )
          } finally {
            clearTimeout(timer)
          }
        }
        if (suite.status !== 'completed') break
      }
      return suite
    })
  } finally {
    active = false
  }
}
