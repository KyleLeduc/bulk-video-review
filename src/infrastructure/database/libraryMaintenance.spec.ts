import { afterEach, expect, it } from 'vitest'
import { LibraryMaintenance } from './libraryMaintenance'

afterEach(() => localStorage.clear())
it('blocks normal operations for maintenance and across reload-like marker recovery', () => {
  const gate = new LibraryMaintenance(localStorage, 'test-restore')
  gate.begin()
  expect(() => gate.assertAvailable()).toThrow(/maintenance/i)
  gate.markRestore()
  gate.end()
  expect(
    new LibraryMaintenance(localStorage, 'test-restore').recoveryRequired(),
  ).toBe(true)
  expect(() => gate.assertAvailable()).toThrow(/restore/i)
  gate.begin(true)
  gate.clearRestore()
  gate.end()
  expect(() => gate.assertAvailable()).not.toThrow()
})
