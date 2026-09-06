import { matchesTrialMessage, type TrialResult } from './videoBenchmarkHost'
import {
  enumerateTrialPairs,
  orderFixtureFiles,
  validateCustomFiles,
} from '../shared/benchmark/videoBenchmarkProtocol'
import reference from '../shared/benchmark/referenceFixtures.json'
import { isBrowserPlayableVideoFile } from '../shared/video/browserPlayableVideoTypes'

async function initialize() {
  const response = await fetch('/benchmark/capabilities', { cache: 'no-store' })
  const capabilities = response.ok ? await response.json() : null
  if (
    capabilities?.enabled !== true ||
    capabilities.protocolVersion !== 2 ||
    window.parent === window
  )
    throw new Error('Unavailable')
  const parts = location.hash.slice(1).split('/')
  if (
    parts.length !== 3 ||
    !parts.every((id) =>
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      ),
    )
  )
    throw new Error('Invalid trial identity')
  const [suiteId, pairId, trialId] = parts
  const ids = { suiteId, pairId, trialId }
  const origin = location.origin
  const send = (type: string, result?: TrialResult) =>
    parent.postMessage({ protocolVersion: 2, ...ids, type, result }, origin)
  let running: Promise<void> | null = null
  let closing = false
  let dispose: (() => void) | null = null
  const listen = async (event: MessageEvent) => {
    if (!matchesTrialMessage(event, parent, origin, ids) || closing) return
    if (event.data.type === 'run' && !running) {
      running = (async () => {
        const { files, configuration, build, selection } = event.data
        enumerateTrialPairs([configuration], configuration.repetition)
        if (
          !['cold', 'warm'].includes(configuration.cache) ||
          JSON.stringify(build) !== JSON.stringify(capabilities.build)
        )
          throw new Error('Trial identity mismatch')
        const ordered =
          selection === undefined
            ? orderFixtureFiles(files, reference)
            : validateCustomFiles(files, selection)
        if (
          selection !== undefined &&
          !ordered.every(isBrowserPlayableVideoFile)
        )
          throw new TypeError('Unsupported custom media type')
        // Qualify capability and message ownership before creating services.
        const [
          { createApp },
          { createPinia },
          { default: Trial },
          { createVideoServices },
          { DatabaseConnection },
          keys,
        ] = await Promise.all([
          import('vue'),
          import('pinia'),
          import('./VideoBenchmarkTrial.vue'),
          import('../infrastructure/di/createVideoServices'),
          import('../infrastructure/database/DatabaseConnection'),
          import('../presentation/di/injectionKeys'),
        ])
        const connection = DatabaseConnection.forBenchmark(pairId)
        const services = createVideoServices({
          databaseConnection: connection,
          previewMode: 'legacy-stills',
        })
        const app = createApp(Trial, {
          connection,
          services,
          configuration,
          build,
          selection,
        })
        app.use(createPinia())
        app.provide(keys.ADD_VIDEOS_USE_CASE_KEY, services.addVideosUseCase)
        if (services.updateThumbUseCase)
          app.provide(
            keys.UPDATE_THUMB_USE_CASE_KEY,
            services.updateThumbUseCase,
          )
        app.provide(keys.UPDATE_VOTES_USE_CASE_KEY, services.updateVotesUseCase)
        app.provide(keys.LOGGER_KEY, services.logger)
        app.provide(
          keys.VIDEO_SESSION_REGISTRY_KEY,
          services.videoSessionRegistry,
        )
        dispose = () => {
          connection.close()
          app.unmount()
        }
        const trial = app.mount('#trial') as unknown as {
          run(files: File[]): Promise<TrialResult>
          close(): void
        }
        dispose = () => {
          trial.close()
          app.unmount()
        }
        send('result', await trial.run(ordered))
      })().catch(() => {
        send('error')
      })
    } else if (event.data.type === 'close') {
      closing = true
      await running
      try {
        dispose?.()
        send('closed')
      } catch {
        send('error')
      }
      window.removeEventListener('message', listen)
    }
  }
  window.addEventListener('message', listen)
  send('ready')
}
initialize().catch(() => {
  document.querySelector('#trial')!.textContent = 'Benchmark trial unavailable'
})
