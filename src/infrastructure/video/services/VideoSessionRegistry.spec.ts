import { expect, it } from 'vitest'
import { buildLogger } from '@test-utils/index'
import { VideoSessionRegistry } from './VideoSessionRegistry'
it('exposes only currently registered original files', () => {
  const registry = new VideoSessionRegistry(buildLogger())
  const file = new File(['mp4'], 'local.mp4')
  expect(registry.getFile('id')).toBeNull()
  registry.registerFile('id', file)
  expect(registry.getFile('id')).toBe(file)
  registry.unregisterFile('id')
  expect(registry.getFile('id')).toBeNull()
})
