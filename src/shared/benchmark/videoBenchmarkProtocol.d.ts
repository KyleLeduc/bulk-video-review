export interface Configuration {
  backend: string
  foreground: number
  previews: number
}
export interface TrialPair extends Configuration {
  repetition: number
}
export interface TrialConfiguration extends TrialPair {
  cache: 'cold' | 'warm'
}
export interface FixtureSelection {
  files: { path: string; bytes: number; sha256: string }[]
}
export interface BuildIdentity {
  revision: string | null
  assetsSha256: string | null
  dirty: boolean | null
  source?: string
}
export function enumerateTrialPairs(
  configurations: readonly Configuration[],
  repetitions: number,
): TrialPair[]
export function orderFixtureFiles(
  files: Iterable<File> | ArrayLike<File>,
  manifest: FixtureSelection,
): File[]
export function validatePipelineSuite(suite: unknown): string[]
export function validateTerminalReport(
  report: unknown,
  cache: string,
  expected: unknown,
): string[]
export function validateMeasurements(
  report: unknown,
  configuration: unknown,
  expected: unknown,
): string[]
export function validateReport(
  report: unknown,
  cache: string,
  expected: unknown,
): string[]
export function summarize(values: number[]): {
  count: number
  median: number | null
  p95: number | null
  min: number | null
  max: number | null
}
