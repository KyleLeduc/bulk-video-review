import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('VideoGallery', () => {
  test('uses zero spacing between video cards in the gallery grid', () => {
    const source = readFileSync(
      `${process.cwd()}/src/presentation/views/VideoGallery.vue`,
      'utf8',
    )

    expect(source).toContain('gap: 0;')
  })
})
