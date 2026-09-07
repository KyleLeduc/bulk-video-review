// @vitest-environment node
import { expect, it, vi } from 'vitest'
import {
  InspectFailedVideoFilesUseCase,
  formatFileAudit,
} from './InspectFailedVideoFilesUseCase'
import type { FileInspection } from '@app/ports/IVideoFileInspector'

const inspection: FileInspection = {
  container: 'mp4-family',
  fragmented: false,
  decodeChecked: false,
  coverage: { boxes: 3, readBytes: 40, completeTopLevelScan: true },
  findings: [],
}
it('produces an explicitly named audit, flags duplicate names and preserves escaped paths as data', async () => {
  const file = new File(['header'], 'quote"\n雪.mp4')
  const useCase = new InspectFailedVideoFilesUseCase(
    { inspect: vi.fn().mockResolvedValue(inspection) },
    { getFile: () => file },
  )
  const sources = ['a', 'b'].map((videoId) => ({
    videoId,
    title: 'private title',
    failures: { motionClips: 'unsupported-timeline' },
    diagnostics: { motionClips: { trackStart: 3, storedDuration: 60 } },
  }))
  const result = await useCase.execute(sources, {
    signal: new AbortController().signal,
  })
  expect(result).toHaveLength(2)
  expect(result[0].duplicateBasename).toBe(true)
  expect(result[0].relativePath).toBeNull()
  expect(result[0].inspection.findings.map((item) => item.code)).toContain(
    'adapter-timeline-restriction',
  )
  const text = formatFileAudit(result)
  expect(text).toContain('quote\\"\\n雪.mp4')
  expect(text).not.toContain('quote"\n雪.mp4')
  expect(text).toContain('not a playback certification')
})
it('does not attribute findings to replaced or missing sources', async () => {
  let file: File | null = new File(['a'], 'a.mp4')
  const useCase = new InspectFailedVideoFilesUseCase(
    {
      inspect: async () => {
        file = null
        return inspection
      },
    },
    { getFile: (id) => (id === 'a' ? file : null) },
  )
  const result = await useCase.execute(
    [
      { videoId: 'a', title: 'a', failures: {} },
      { videoId: 'b', title: 'b', failures: {} },
    ],
    { signal: new AbortController().signal },
  )
  expect(result[0].inspection.findings[0].code).toBe('source-changed')
  expect(result[1].inspection.findings[0].code).toBe('missing-source')
})
