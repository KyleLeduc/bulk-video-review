// @vitest-environment node

import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'

import { FileHashGenerator } from './FileHashGenerator'

describe('FileHashGenerator', () => {
  test.each([
    ['clip.mp4', 'video-bytes'],
    ['vídéø-🎬.webm', 'content'],
    [`${'long-name-'.repeat(15)}clip.mp4`, 'another-video'],
  ])(
    'keeps generating SHA-256 video ids without WebCrypto for %s',
    async (name, contents) => {
      const file = new File([contents], name)
      const expected = createHash('sha256')
        .update(file.name + file.size)
        .digest('hex')

      const generator = new FileHashGenerator(null)

      await expect(generator.generate(file)).resolves.toBe(expected)
    },
  )

  test('uses WebCrypto when a digest implementation is available', async () => {
    const digest = vi.fn(async () => Uint8Array.from([0, 15, 255]).buffer)
    const generator = new FileHashGenerator(digest)

    await expect(generator.generate(new File([], 'clip.mp4'))).resolves.toBe(
      '000fff',
    )
    expect(digest).toHaveBeenCalledOnce()
  })
})
