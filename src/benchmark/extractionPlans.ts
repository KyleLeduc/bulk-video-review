import type { PreviewCount } from '../infrastructure/video/benchmark/previewExtraction'
import {
  CLIP_FRAME_RATES,
  type ClipFrameRate,
} from '../infrastructure/video/benchmark/clipExtraction'

export type ExtractionPreset =
  | 'confirmation-v1'
  | 'still-matrix-v1'
  | 'clips-3s-v1'
  | 'clips-quality-v1'
export type PlanStep = { id: string; pass: number } & (
  | {
      workload: 'stills'
      execution: 'dom' | 'mediabunny'
      jobs: 2 | 4
      previewCount: PreviewCount
    }
  | {
      workload: 'clips'
      execution: 'mediabunny'
      jobs: 1
      frameRate?: ClipFrameRate
    }
)
export type ClipPlanStep = Extract<PlanStep, { workload: 'clips' }>
export function planSteps(preset: ExtractionPreset): PlanStep[] {
  if (preset === 'clips-quality-v1')
    return CLIP_FRAME_RATES.map((frameRate) => ({
      id: `clips-3s-${frameRate}fps`,
      pass: 1,
      workload: 'clips',
      execution: 'mediabunny',
      jobs: 1,
      frameRate,
    }))
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
