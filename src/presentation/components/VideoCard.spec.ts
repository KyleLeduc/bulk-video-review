import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildParsedVideo, createPresentationTestContext } from '@test-utils/index'
import VideoCard from './VideoCard.vue'

describe('VideoCard', () => {
  test('renders media inside a fixed 16:9 landscape frame', () => {
    const { global } = createPresentationTestContext({
      sessionRegistry: {
        acquireObjectUrl: vi.fn(() => ''),
      },
    })

    const wrapper = mount(VideoCard, {
      props: {
        video: buildParsedVideo({
          thumb: 'thumb-1.jpg',
          thumbUrls: ['thumb-1.jpg'],
        }),
      },
      global,
    })

    expect(
      wrapper.get('[data-testid="video-card-media-frame"]').attributes('style'),
    ).toContain('aspect-ratio: 16 / 9;')
  })

  test('uses border-box sizing for full-width cards so bordered tiles stay inside grid tracks', () => {
    const source = readFileSync(
      `${process.cwd()}/src/presentation/components/VideoCard.vue`,
      'utf8',
    )

    expect(source).toContain('width: 100%;')
    expect(source).toContain('box-sizing: border-box;')
  })
})
