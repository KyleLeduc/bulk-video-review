import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import VideoBenchmarkTrial from './VideoBenchmarkTrial.vue'
import { DatabaseConnection } from '../infrastructure/database/DatabaseConnection'
import { createVideoServices } from '../infrastructure/di/createVideoServices'
import type { TrialResult } from './videoBenchmarkHost'
import { VideoPreviewRepository } from '../infrastructure/repository/VideoPreviewRepository'
import { createCustomSelection } from '../shared/benchmark/videoBenchmarkProtocol'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const state = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))
vi.mock('../presentation/stores/videosStore', () => ({
  useVideoStore: () => state.store,
}))

describe('real-store trial observation', () => {
  test.each([false, true])(
    'checks actual custom output counts while rejecting invalid JPEGs (%s)',
    async (custom) => {
      const video = {
        id: 'video',
        duration: 10,
        votes: 0,
        thumb: 'data:image/png;base64,YWJj',
        previewFrames: Array(9).fill({}),
      }
      state.store = {
        displayedIngestionSession: {
          status: 'completed',
          pipelineCompletedAtMs: 1,
          previewAttempts: { started: 0, completed: 0, failed: 0, aborted: 0 },
        },
        allVideos: [video],
        setIngestionConcurrencyOverride: vi.fn(),
        setThumbnailConcurrencyOverride: vi.fn(),
        addVideosFromFiles: vi.fn(async () => {}),
        createDisplayedIngestionRunReport: vi.fn(() =>
          custom
            ? { foreground: { counts: { created: 1, existing: 0 } } }
            : null,
        ),
      }
      const connection = DatabaseConnection.forBenchmark(
        '12345678-1234-4123-8123-123456789abc',
      )
      const services = createVideoServices({ databaseConnection: connection })
      vi.spyOn(services.videoQueryAdapter, 'getAllVideos').mockResolvedValue([
        video,
      ] as never)
      vi.spyOn(VideoPreviewRepository.prototype, 'getFrames').mockResolvedValue(
        Array.from({ length: 9 }, (_, index) => ({
          timestampSeconds: index + 1,
          width: 10,
          height: 10,
          blob: new Blob(['png'], { type: 'image/png' }),
        })) as never,
      )
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
      )
      const wrapper = mount(VideoBenchmarkTrial, {
        props: {
          selection: custom
            ? createCustomSelection([new File(['clip'], 'personal.mp4')])
            : undefined,
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
      const result = await (
        wrapper.vm as unknown as { run(files: File[]): Promise<TrialResult> }
      ).run([])
      expect(result.row.outputs?.errors).toContain(
        'Invalid persisted JPEG primary thumbnail',
      )
      expect(result.row.outputs?.errors).toContain('Invalid preview descriptor')
      if (custom) {
        expect(result.row.outputs?.errors).not.toContain(
          'Persisted video count mismatch',
        )
        expect(result.row.outputs?.errors).not.toContain(
          'Total preview count mismatch',
        )
      }
      wrapper.unmount()
    },
  )
  test.each([false, true])(
    'waits for previews and retains terminal timing even if output reads fail (%s)',
    async (readFailure) => {
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
      if (readFailure)
        vi.mocked(services.videoQueryAdapter.getAllVideos).mockRejectedValue(
          new Error('IndexedDB read failed'),
        )
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
      expect(result.row.wallMs).toBeTypeOf('number')
      if (readFailure)
        expect(result.row.outputs?.errors).toContain(
          'Persisted output inspection failed',
        )
      wrapper.unmount()
    },
  )
})
