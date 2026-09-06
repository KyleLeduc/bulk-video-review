import type { PreviewCount } from '../infrastructure/video/benchmark/previewExtraction'

export type ExtractionPreset =
  | 'confirmation-v1'
  | 'still-matrix-v1'
  | 'clips-3s-v1'
export type PlanStep = { id: string; pass: number } & (
  | {
      workload: 'stills'
      execution: 'dom' | 'mediabunny'
      jobs: 2 | 4
      previewCount: PreviewCount
    }
  | { workload: 'clips'; execution: 'mediabunny'; jobs: 1 }
)
export function planSteps(preset: ExtractionPreset): PlanStep[] {
  if (preset === 'clips-3s-v1')
    return [
      {
        id: 'clips-3s-1-job',
        pass: 1,
        workload: 'clips',
        execution: 'mediabunny',
        jobs: 1,
      },
    ]
  if (preset !== 'confirmation-v1' && preset !== 'still-matrix-v1')
    throw new Error('Unknown test plan')
  const first: PlanStep[] = []
  for (const previewCount of (preset === 'confirmation-v1'
    ? [9]
    : [9, 100]) as PreviewCount[]) {
    for (const jobs of (preset === 'confirmation-v1' ? [4] : [2, 4]) as (
      | 2
      | 4
    )[]) {
      // Start with candidate: reverses the user's original DOM-first manual sequence.
      for (const execution of ['mediabunny', 'dom'] as const)
        first.push({
          id: `${execution}-${jobs}-${previewCount}`,
          pass: 1,
          workload: 'stills',
          execution,
          jobs,
          previewCount,
        })
    }
  }
  return [
    ...first,
    ...[...first].reverse().map((step) => ({ ...step, pass: 2 })),
  ]
}
