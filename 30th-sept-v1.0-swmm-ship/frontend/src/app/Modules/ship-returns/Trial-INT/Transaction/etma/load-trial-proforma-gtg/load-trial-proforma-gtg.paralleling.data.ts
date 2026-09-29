export type ParallelingLoadDirection = 'incrs' | 'decrs';

export interface ParallelingSharingRowConfig {
  direction: ParallelingLoadDirection;
  loadPercent: number;
  label: string;
}

export const PARALLELING_INCREASING_LOADS: ParallelingSharingRowConfig[] = [
  { direction: 'incrs', loadPercent: 20, label: '20' },
  { direction: 'incrs', loadPercent: 30, label: '30' },
  { direction: 'incrs', loadPercent: 45, label: '45' },
  { direction: 'incrs', loadPercent: 60, label: '60' },
  { direction: 'incrs', loadPercent: 75, label: '75' },
];

export const PARALLELING_DECREASING_LOADS: ParallelingSharingRowConfig[] = [
  { direction: 'decrs', loadPercent: 75, label: '75' },
  { direction: 'decrs', loadPercent: 60, label: '60' },
  { direction: 'decrs', loadPercent: 45, label: '45' },
  { direction: 'decrs', loadPercent: 30, label: '30' },
  { direction: 'decrs', loadPercent: 20, label: '20' },
];

export const PARALLELING_SHARING_ROWS: ParallelingSharingRowConfig[] = [
  ...PARALLELING_INCREASING_LOADS,
  ...PARALLELING_DECREASING_LOADS,
];

/** Legacy API key prefix: unttnddprllng_incrs_20_KW_combined_val */
export function parallelingLegacyFieldPrefix(
  direction: ParallelingLoadDirection,
  loadPercent: number,
  unit: 'KW' | 'KVA',
): string {
  return `unttnddprllng_${direction}_${loadPercent}_${unit}`;
}
