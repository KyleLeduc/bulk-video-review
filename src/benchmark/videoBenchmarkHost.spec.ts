import { describe, expect, test } from 'vitest'
import { matchesTrialMessage, pipelineSettled } from './videoBenchmarkHost'

describe('trial boundary', () => {
  const ids = { suiteId: 's', pairId: 'p', trialId: 't' }
  const data = { ...ids, protocolVersion: 2, type: 'ready' }
  const event = () =>
    ({
      data,
      source: window,
      origin: 'https://bvr.test',
    }) as unknown as MessageEvent
  test('accepts only the exact source, origin, version and complete trial identity', () => {
    expect(matchesTrialMessage(event(), window, 'https://bvr.test', ids)).toBe(
      true,
    )
    for (const changed of [
      { ...event(), source: null },
      { ...event(), origin: 'https://evil.test' },
      ...['suiteId', 'pairId', 'trialId', 'protocolVersion', 'type'].map(
        (key) => ({ ...event(), data: { ...data, [key]: 'wrong' } }),
      ),
      { ...event(), data: null },
    ])
      expect(
        matchesTrialMessage(
          changed as MessageEvent,
          window,
          'https://bvr.test',
          ids,
        ),
      ).toBe(false)
  })
  test('foreground completion is not enough: all preview attempts must settle', () => {
    const session = {
      status: 'completed',
      pipelineCompletedAtMs: 20,
      previewAttempts: { started: 1, completed: 1, failed: 0, aborted: 0 },
    }
    expect(pipelineSettled(session)).toBe(true)
    expect(pipelineSettled(null)).toBe(false)
    expect(pipelineSettled({ ...session, status: 'thumbnailing' })).toBe(false)
    expect(pipelineSettled({ ...session, pipelineCompletedAtMs: null })).toBe(
      false,
    )
    expect(
      pipelineSettled({
        ...session,
        previewAttempts: { ...session.previewAttempts, completed: 0 },
      }),
    ).toBe(false)
  })
})
