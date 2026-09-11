import type { PreviewCount } from '../infrastructure/video/extraction/previewExtraction'
import {
  CLIP_FRAME_RATES,
  CLIP_DURATIONS,
  type ClipSeconds,
  type ClipFrameRate,
} from '../infrastructure/video/extraction/clipExtraction'

export type ExtractionPreset =
  | 'motion-keyframes-quality-v1'
  | 'seek-backends-v1'
  | 'confirmation-v1'
  | 'still-matrix-v1'
  | 'clips-3s-v1'
  | 'clips-quality-v1'
  | 'clips-duration-v1'
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
      clipSeconds?: ClipSeconds
      production?: true
    }
  | {
      workload: 'keyframes'
      execution: 'dom' | 'mediabunny'
      jobs: 1 | 2
      maxWidth: 120 | 160 | 240
    }
)
export type ClipPlanStep = Extract<PlanStep, { workload: 'clips' }>
export type KeyframePlanStep = Extract<PlanStep, { workload: 'keyframes' }>
export function planSteps(preset: ExtractionPreset): PlanStep[] {
  if (preset === 'seek-backends-v1') {
    const first: KeyframePlanStep[] = []
    for (const jobs of [1, 2] as const)
      for (const execution of ['mediabunny', 'dom'] as const)
        first.push({
          id: `seek-${execution}-${jobs}-160px`,
          pass: 1,
          workload: 'keyframes',
          execution,
          jobs,
          maxWidth: 160,
        })
    return [
      ...first,
      ...[...first].reverse().map((step) => ({ ...step, pass: 2 })),
    ]
  }
  if (preset === 'motion-keyframes-quality-v1')
    return [
      {
        id: 'motion-1.5s-20fps',
        pass: 1,
        workload: 'clips',
        execution: 'mediabunny',
        jobs: 1,
        frameRate: 20,
        clipSeconds: 1.5,
        production: true,
      },
      ...([120, 160, 240] as const).map((maxWidth) => ({
        id: `keyframes-${maxWidth}px`,
        pass: 1,
        workload: 'keyframes' as const,
        execution: 'mediabunny' as const,
        jobs: 1 as const,
        maxWidth,
      })),
    ]
  if (preset === 'clips-duration-v1')
    return CLIP_DURATIONS.map((clipSeconds) => ({
      id: `clips-${clipSeconds}s-20fps`,
      pass: 1,
      workload: 'clips',
      execution: 'mediabunny',
      jobs: 1,
      frameRate: 20,
      clipSeconds,
    }))
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
