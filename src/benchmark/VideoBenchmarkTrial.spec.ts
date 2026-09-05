import { describe, expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import VideoBenchmarkTrial from './VideoBenchmarkTrial.vue'
import { DatabaseConnection } from '../infrastructure/database/DatabaseConnection'
import { createVideoServices } from '../infrastructure/di/createVideoServices'
import type { TrialResult } from './videoBenchmarkHost'

const state = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))
vi.mock('../presentation/stores/videosStore', () => ({
  useVideoStore: () => state.store,
}))

describe('real-store trial observation', () => {
  test('does not return or inspect outputs at foreground completion while previews remain active', async () => {
    const session = reactive({
      status: 'thumbnailing',
      pipelineCompletedAtMs: null as number | null,
      previewAttempts: { started: 1, completed: 0, failed: 0, aborted: 0 },
    })
    const report = vi.fn(() => null)
    state.store = {
      displayedIngestionSession: session,
      allVideos: [],
      setIngestionConcurrencyOverride: vi.fn(),
      setThumbnailConcurrencyOverride: vi.fn(),
      addVideosFromFiles: vi.fn(async () => {}),
      createDisplayedIngestionRunReport: report,
    }
    const connection = DatabaseConnection.forBenchmark(
      '12345678-1234-4123-8123-123456789abc',
    )
    const services = createVideoServices({ databaseConnection: connection })
    vi.spyOn(services.videoQueryAdapter, 'getAllVideos').mockResolvedValue([])
    const wrapper = mount(VideoBenchmarkTrial, {
      props: {
        connection,
        services,
        configuration: {
          backend: 'dom',
          foreground: 2,
          previews: 1,
          repetition: 1,
          cache: 'cold',
        },
        build: { revision: null, assetsSha256: null, dirty: true },
      },
    })
    let settled = false
    const run = (
      wrapper.vm as unknown as { run(files: File[]): Promise<TrialResult> }
    )
      .run([])
      .finally(() => {
        settled = true
      })
    await flushPromises()
    expect(settled).toBe(false)
    expect(report).not.toHaveBeenCalled()
    session.status = 'completed'
    session.pipelineCompletedAtMs = 1
    session.previewAttempts.completed = 1
    const result = await run
    expect(report).toHaveBeenCalledOnce()
    expect(result.row.status).toBe('failed')
    wrapper.unmount()
  })
})
