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
