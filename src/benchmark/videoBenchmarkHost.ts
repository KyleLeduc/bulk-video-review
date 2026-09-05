import type {
  BuildIdentity,
  TrialConfiguration,
} from '../shared/benchmark/videoBenchmarkProtocol'

export interface TrialIds {
  suiteId: string
  pairId: string
  trialId: string
}
export interface TrialRow {
  configuration: TrialConfiguration
  status: 'passed' | 'failed'
  cleanup: 'pending' | 'complete' | 'failed'
  hidden: boolean
  wallMs: number | null
  build: BuildIdentity
  report: unknown
  outputs: {
    valid: boolean
    videos: number
    frames: number
    errors: string[]
  } | null
  errors: string[]
}
export interface TrialResult {
  row: TrialRow
  images: Blob[]
}
export interface TrialHost {
  run(files: File[]): Promise<TrialResult>
  close(): Promise<void>
}
export const limits = { startupMs: 15_000, trialMs: 120_000, cleanupMs: 10_000 }
export interface HostOptions extends TrialIds {
  configuration: TrialConfiguration
  build: BuildIdentity
  mount: HTMLElement
}
export function matchesTrialMessage(
  event: MessageEvent,
  source: Window,
  origin: string,
  ids: TrialIds,
): boolean {
  const data = event.data
  return (
    event.source === source &&
    event.origin === origin &&
    data?.protocolVersion === 2 &&
    ['ready', 'run', 'result', 'close', 'closed', 'error'].includes(
      data.type,
    ) &&
    data.suiteId === ids.suiteId &&
    data.pairId === ids.pairId &&
    data.trialId === ids.trialId
  )
}
export function pipelineSettled(
  session: {
    status: string
    pipelineCompletedAtMs: number | null
    previewAttempts: {
      started: number
      completed: number
      failed: number
      aborted: number
    }
  } | null,
): boolean {
  if (
    !session ||
    session.status !== 'completed' ||
    session.pipelineCompletedAtMs === null
  )
    return false
  const attempts = session.previewAttempts
  return (
    attempts.started === attempts.completed + attempts.failed + attempts.aborted
  )
}

export async function createTrialHost(
  options: HostOptions,
): Promise<TrialHost> {
  const { suiteId, pairId, trialId, mount, configuration, build } = options
  const ids = { suiteId, pairId, trialId }
  const frame = document.createElement('iframe')
  frame.title = `Benchmark ${configuration.cache === 'cold' ? 'fresh' : 'cached'} trial`
  frame.style.cssText =
    'width:100%;height:90px;border:1px solid #aaa;border-radius:6px'
  const origin = location.origin
  let waiter: {
    type: string
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  const listen = (event: MessageEvent) => {
    if (
      !frame.contentWindow ||
      !matchesTrialMessage(event, frame.contentWindow, origin, ids) ||
      !waiter
    )
      return
    if (event.data.type !== waiter.type && event.data.type !== 'error') return
    const current = waiter
    waiter = null
    clearTimeout(current.timer)
    if (event.data.type === 'error')
      current.reject(new Error('Trial host failed'))
    else current.resolve(event.data.result)
  }
  const wait = (type: string, timeout: number) =>
    new Promise<unknown>((resolve, reject) => {
      if (waiter) {
        reject(new Error('Trial request already pending'))
        return
      }
      waiter = {
        type,
        resolve,
        reject,
        timer: setTimeout(() => {
          waiter = null
          reject(new Error(`Trial ${type} deadline exceeded`))
        }, timeout),
      }
    })
  const send = (type: string, payload = {}) =>
    frame.contentWindow!.postMessage(
      { protocolVersion: 2, ...ids, type, ...payload },
      origin,
    )
  const retire = () => {
    window.removeEventListener('message', listen)
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Trial host retired'))
      waiter = null
    }
    frame.remove()
  }
  window.addEventListener('message', listen)
  const ready = wait('ready', limits.startupMs)
  frame.src = `/benchmark/run.html#${suiteId}/${pairId}/${trialId}`
  mount.append(frame)
  try {
    await ready
  } catch (error) {
    retire()
    throw error
  }
  let started = false
  let closed = false
  return {
    async run(files) {
      if (started || closed) throw new Error('Trial already used')
      started = true
      const result = wait('result', limits.trialMs)
      send('run', { files, configuration, build })
      return (await result) as TrialResult
    },
    async close() {
      if (closed) return
      closed = true
      try {
        const settled = wait('closed', limits.cleanupMs)
        send('close')
        await settled
      } finally {
        retire()
      }
    },
  }
}
