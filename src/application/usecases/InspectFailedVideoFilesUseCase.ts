import type { IVideoSessionRegistry } from '@app/ports'
import type {
  FailedVideoSource,
  FileInspection,
  IVideoFileInspector,
} from '@app/ports/IVideoFileInspector'

export type FileAuditItem = FailedVideoSource & {
  name: string
  relativePath: string | null
  bytes: number | null
  declaredType: string | null
  duplicateBasename: boolean
  inspection: FileInspection
}
const unavailable = (code: string): FileInspection => ({
  container: 'unknown',
  fragmented: false,
  decodeChecked: false,
  coverage: { readBytes: 0, boxes: 0, completeTopLevelScan: false },
  findings: [
    {
      severity: 'warning',
      code,
      detail:
        'Original source is missing or changed. Reselect it and repeat the audit.',
    },
  ],
})

export class InspectFailedVideoFilesUseCase {
  constructor(
    private readonly inspector: IVideoFileInspector,
    private readonly registry: Pick<IVideoSessionRegistry, 'getFile'>,
  ) {}

  async execute(
    sources: FailedVideoSource[],
    options: { signal: AbortSignal; onItem?: (item: FileAuditItem) => void },
  ): Promise<FileAuditItem[]> {
    const selected = sources.map((source) => ({
      source,
      file: this.registry.getFile(source.videoId),
    }))
    const names = new Map<string, number>()
    for (const { file } of selected)
      if (file) names.set(file.name, (names.get(file.name) ?? 0) + 1)
    const results: FileAuditItem[] = []
    for (const { source, file } of selected) {
      options.signal.throwIfAborted()
      let inspection =
        file && this.registry.getFile(source.videoId) === file
          ? await this.inspector.inspect(file, options)
          : unavailable(file ? 'source-changed' : 'missing-source')
      options.signal.throwIfAborted()
      if (file && this.registry.getFile(source.videoId) !== file)
        inspection = unavailable('source-changed')
      // Do not mutate an inspector result shared with another caller.
      inspection = { ...inspection, findings: [...inspection.findings] }
      if (Object.values(source.failures).includes('unsupported-timeline'))
        inspection.findings.push({
          severity: 'info',
          code: 'adapter-timeline-restriction',
          detail:
            'The preview adapter rejected this timeline. That does not establish file damage; compare stored duration and track timestamps with ffprobe.',
        })
      if (Object.values(source.failures).includes('unsupported'))
        inspection.findings.push({
          severity: 'info',
          code: 'adapter-unsupported',
          detail:
            'The current preview adapter could not use this container/codec configuration. This is not a full browser playback test.',
        })
      const item: FileAuditItem = {
        ...source,
        name: file?.name ?? source.title,
        relativePath: file?.webkitRelativePath || null,
        bytes: file?.size ?? null,
        declaredType: file?.type || null,
        duplicateBasename: file ? (names.get(file.name) ?? 0) > 1 : false,
        inspection,
      }
      results.push(item)
      options.onItem?.(item)
    }
    return results
  }
}

/** Paths are quoted data, never an executable shell or PowerShell command. */
export function formatFileAudit(items: FileAuditItem[]): string {
  const quote = (value: string) =>
    JSON.stringify(value).replace(
      /[\u202a-\u202e\u2066-\u2069]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    )
  return [
    'BVR failed-file audit — contains private filenames/paths.',
    'Read-only bounded header inspection; not a playback certification. No files were repaired.',
    'Use the JSON manifest as data for a separate ffprobe/FFmpeg workflow; do not execute filenames as commands.',
    ...items.flatMap((item, index) => [
      '',
      `${index + 1}. ${quote(item.relativePath ?? item.name)}${item.duplicateBasename ? ' [duplicate basename]' : ''}`,
      `   ID: ${quote(item.videoId)}; bytes: ${item.bytes ?? 'unknown'}; container: ${item.inspection.container}; MIME: ${quote(item.declaredType ?? 'unknown')}`,
      `   Folder-relative path: ${item.relativePath ? 'available' : 'unavailable; select a folder to preserve relative paths'}`,
      `   Stored player duration: ${item.storedDuration ?? 'unmeasured'} seconds. Codec/timeline fields below are reported evidence, not a new decode test.`,
      `   Products: ${JSON.stringify(item.failures)}; measured evidence: ${JSON.stringify(item.diagnostics ?? {})}`,
      `   Coverage: ${item.inspection.coverage.boxes} top-level boxes, ${item.inspection.coverage.readBytes} bytes read, ${item.inspection.coverage.completeTopLevelScan ? 'complete top-level scan only' : 'partial/signature-only'}.`,
      ...item.inspection.findings.map(
        (finding) =>
          `   ${finding.severity.toUpperCase()} ${finding.code}: ${finding.detail}`,
      ),
      ...(item.inspection.findings.length
        ? []
        : [
            '   No top-level boundary defect detected. Internal metadata and media packets were not decoded.',
          ]),
    ]),
  ].join('\n')
}
