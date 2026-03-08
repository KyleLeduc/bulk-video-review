import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getBrowserPlayableVideoAccept,
  isBrowserPlayableVideoFile,
} from './browserPlayableVideoTypes'

describe('browserPlayableVideoTypes', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (type: string) => {
        if (type === 'video/mp4' || type === 'video/ogg') {
          return 'probably'
        }

        return ''
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('uses file extensions only when the browser does not provide a specific MIME type', () => {
    const explicitAudioFile = new File(['audio-bytes'], 'sample.ogg', {
      type: 'audio/ogg',
    })
    const unknownMimeFile = new File(['video-bytes'], 'sample.ogg', {
      type: '',
    })
    const genericMimeFile = new File(['video-bytes'], 'sample.ogg', {
      type: 'application/octet-stream',
    })

    expect(isBrowserPlayableVideoFile(explicitAudioFile)).toBe(false)
    expect(isBrowserPlayableVideoFile(unknownMimeFile)).toBe(true)
    expect(isBrowserPlayableVideoFile(genericMimeFile)).toBe(true)
  })

  test('builds an accept string from only browser-playable video types', () => {
    expect(getBrowserPlayableVideoAccept()).toBe(
      'video/mp4,.mp4,.m4v,video/ogg,.ogv,.ogg',
    )
  })
})
