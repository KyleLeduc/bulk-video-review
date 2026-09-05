import { describe, expect, test, vi } from 'vitest'
import {
  disposeVideoElement,
  generateThumbnails,
  loadVideoElement,
} from '@infra/video/services/videoDomUtils'
import { VideoThumbnailGeneratorAdapter } from './VideoThumbnailGeneratorAdapter'

vi.mock('@infra/video/services/videoDomUtils', () => ({
  disposeVideoElement: vi.fn(),
  generateThumbnails: vi.fn(),
  loadVideoElement: vi.fn(),
}))

describe('VideoThumbnailGeneratorAdapter', () => {
  test.each(['completed', 'failed', 'aborted'] as const)(
    'measures metadata load through its %s settlement',
    async (outcome) => {
      let clockMs = 100
      const clock = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => clockMs)
      const video = document.createElement('video')
      const error = new DOMException(
        'load failed',
        outcome === 'aborted' ? 'AbortError' : 'Error',
      )
      vi.mocked(loadVideoElement).mockImplementation(async () => {
        clockMs += 45
        if (outcome !== 'completed') throw error
        return video
      })
      vi.mocked(generateThumbnails).mockResolvedValue([])
      const onTiming = vi.fn()
      try {
        const result = new VideoThumbnailGeneratorAdapter().generateThumbnails(
          'blob:video',
          { onTiming },
        )
        if (outcome === 'completed') await expect(result).resolves.toEqual([])
        else await expect(result).rejects.toBe(error)
        expect(onTiming.mock.calls).toEqual([
          [{ phase: 'metadata', durationMs: 45, outcome }],
        ])
      } finally {
        clock.mockRestore()
      }
    },
  )

  test('always disposes its hidden video when generation fails', async () => {
    const video = document.createElement('video')
    vi.mocked(loadVideoElement).mockResolvedValue(video)
    vi.mocked(generateThumbnails).mockRejectedValue(new Error('encode failed'))
    const adapter = new VideoThumbnailGeneratorAdapter()

    await expect(adapter.generateThumbnails('blob:video')).rejects.toThrow(
      'encode failed',
    )

    expect(disposeVideoElement).toHaveBeenCalledWith(video)
  })
})
