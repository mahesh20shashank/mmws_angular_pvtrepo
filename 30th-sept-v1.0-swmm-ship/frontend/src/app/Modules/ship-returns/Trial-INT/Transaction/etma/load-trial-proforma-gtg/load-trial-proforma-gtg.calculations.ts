/** Row indices in {@link STEADY_STATE_LOAD_ROWS} for speed-control calculations. */
export const STEADY_STATE_ROW_INDEX = {
  FULL_LOAD: 0,
  NO_LOAD: 4,
  GOVERNOR_DROOP: 9,
} as const;

export function parseFrequency(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Nominal = (Initial Speed + Final Speed) / 2 */
export function calculateNominalFrequency(
  initialSpeed: number | null,
  finalSpeed: number | null,
): number | null {
  if (initialSpeed === null || finalSpeed === null) return null;
  return (initialSpeed + finalSpeed) / 2;
}

/** Governor Droop % = |Final Speed − Initial Speed| × 100 / Nominal */
export function calculateGovernorDroop(
  initialSpeed: number | null,
  finalSpeed: number | null,
): number | null {
  const nominal = calculateNominalFrequency(initialSpeed, finalSpeed);
  if (initialSpeed === null || finalSpeed === null || nominal === null || nominal === 0) {
    return null;
  }
  return (Math.abs(finalSpeed - initialSpeed) * 100) / nominal;
}

/** Frequency Modulation = |Initial − Final| / Nominal Frequency × 50 */
export function calculateFrequencyModulation(
  initialSpeedHz: number | null,
  finalSpeedHz: number | null,
  nominalFrequency: number | null,
): number | null {
  if (
    initialSpeedHz === null ||
    finalSpeedHz === null ||
    nominalFrequency === null ||
    nominalFrequency === 0
  ) {
    return null;
  }
  return (Math.abs(initialSpeedHz - finalSpeedHz) / nominalFrequency) * 50;
}

export function roundFrequencyCalculation(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Permissible limit: less than ± 0.25% of rated frequency. */
export const FREQUENCY_MODULATION_SAT_LIMIT_PERCENT = 0.25;

export type SteadyStateStatus = 'Sat' | 'Unsat' | '';

/** Sat when frequency modulation is below the ± 0.25% limit; otherwise Unsat. */
export function evaluateFrequencyModulationStatus(
  modulationPercent: number | null,
): SteadyStateStatus {
  if (modulationPercent === null) return '';
  return modulationPercent < FREQUENCY_MODULATION_SAT_LIMIT_PERCENT ? 'Sat' : 'Unsat';
}

/** Governor droop row: permissible range 2% to 4%. */
export function evaluateGovernorDroopStatus(droopPercent: number | null): SteadyStateStatus {
  if (droopPercent === null) return '';
  return droopPercent >= 2 && droopPercent <= 4 ? 'Sat' : 'Unsat';
}

/** % peak = |Initial frequency − Momentary frequency| × 100 / Nominal frequency */
export function calculatePeakPercent(
  initialSpeedHz: number | null,
  momentarySpeedHz: number | null,
  nominalFrequency: number | null,
): number | null {
  if (
    initialSpeedHz === null ||
    momentarySpeedHz === null ||
    nominalFrequency === null ||
    nominalFrequency === 0
  ) {
    return null;
  }
  return (Math.abs(initialSpeedHz - momentarySpeedHz) * 100) / nominalFrequency;
}

export function evaluatePeakStatus(
  peakObserved: number | null,
  peakPermissibleLimit: number | null,
): SteadyStateStatus {
  if (peakObserved === null || peakPermissibleLimit === null) return '';
  return peakObserved <= peakPermissibleLimit ? 'Sat' : 'Unsat';
}

export function evaluateRecoveryTimeStatus(
  observedSeconds: number | null,
  permissibleSeconds: number | null,
): SteadyStateStatus {
  if (observedSeconds === null || permissibleSeconds === null) return '';
  return observedSeconds <= permissibleSeconds ? 'Sat' : 'Unsat';
}

export function isUnspecifiedLimit(label: unknown): boolean {
  if (label === null || label === undefined || label === '') return true;
  const text = String(label).trim().toLowerCase();
  return text === 'not specified' || text === 'na' || text === 'n/a' || text === '-';
}

export function resolveInheritedRowLimit(
  rows: Array<{ peakPermissibleLimit?: string; recoveryPermissibleLimit?: string }>,
  index: number,
  field: 'peakPermissibleLimit' | 'recoveryPermissibleLimit',
): string | undefined {
  for (let i = index; i >= 0; i--) {
    const value = rows[i]?.[field];
    if (value) return value;
  }
  return undefined;
}

function transientPairKey(loadInitial: string, loadTo: string): string {
  const from = Number(loadInitial);
  const to = Number(loadTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  return `${Math.min(from, to)}-${Math.max(from, to)}`;
}

/**
 * Transient Sat/Unsat from % Peak and Observed(Sec) only. Final Value is not used.
 * Empty inputs stay blank. Pair 0↔25 / 0↔75 have no numeric peak limit; 0↔50 / 0↔100 use the published bands.
 */
export function evaluateTransientRowStatus(
  kind: 'on' | 'off',
  loadInitial: string,
  loadTo: string,
  peakObserved: number | null,
  timeObserved: number | null,
): SteadyStateStatus {
  const pair = transientPairKey(loadInitial, loadTo);

  if (kind === 'on') {
    if (pair === '0-25' || pair === '0-75') {
      if (peakObserved === null || timeObserved === null) return '';
      return 'Sat';
    }
    if (pair === '0-50') {
      if (peakObserved === null || timeObserved === null) return '';
      return peakObserved <= 1 && timeObserved <= 3 && peakObserved >= 0 && timeObserved >= 0
        ? 'Sat'
        : 'Unsat';
    }
    if (pair === '0-100') {
      if (peakObserved === null || timeObserved === null) return '';
      return peakObserved <= 2 && timeObserved <= 5 && peakObserved >= 0 && timeObserved >= 0
        ? 'Sat'
        : 'Unsat';
    }
    return '';
  }

  if (pair === '0-25' || pair === '0-75') {
    if (timeObserved === null) return '';
    if (timeObserved === 0 || timeObserved > 2) return 'Unsat';
    return 'Sat';
  }
  if (pair === '0-50') {
    if (peakObserved === null || timeObserved === null) return '';
    return peakObserved <= 5 && timeObserved <= 2 && peakObserved >= 0 && timeObserved >= 0
      ? 'Sat'
      : 'Unsat';
  }
  if (pair === '0-100') {
    if (peakObserved === null || timeObserved === null) return '';
    return peakObserved <= 5 && timeObserved <= 15 && peakObserved >= 0 && timeObserved >= 0
      ? 'Sat'
      : 'Unsat';
  }
  return '';
}

export function parsePercentLabel(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/[\d.]+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Voltage modulation (%) = 100 × |Vmax − Vmin| / (2 × Vnominal). Always non-negative. */
export function calculateVoltageModulation(
  voltsMax: number | null,
  voltsMin: number | null,
  nominalVoltage: number | null,
): number | null {
  if (voltsMax === null || voltsMin === null || nominalVoltage === null || nominalVoltage === 0) {
    return null;
  }
  return (100 * Math.abs(voltsMax - voltsMin)) / (2 * nominalVoltage);
}

export const VOLTAGE_MODULATION_SAT_LIMIT_PERCENT = 2;

/** Sat when modulation is below 2%. */
export function evaluateVoltageModulationStatus(
  modulationPercent: number | null,
): SteadyStateStatus {
  if (modulationPercent === null) return '';
  return Math.abs(modulationPercent) < VOLTAGE_MODULATION_SAT_LIMIT_PERCENT ? 'Sat' : 'Unsat';
}

/** Difference between max and min of three line voltages. */
export function calculateVoltageBalanceDifference(
  ry: number | null,
  yb: number | null,
  br: number | null,
): number | null {
  if (ry === null || yb === null || br === null) return null;
  return Math.max(ry, yb, br) - Math.min(ry, yb, br);
}

/** Permissible limit = 1% of average of three line voltages. */
export function calculateVoltageBalancePermissibleLimit(
  ry: number | null,
  yb: number | null,
  br: number | null,
): number | null {
  if (ry === null || yb === null || br === null) return null;
  return (ry + yb + br) / 3 / 100;
}

export function evaluateVoltageBalanceStatus(
  difference: number | null,
  permissibleLimit: number | null,
): SteadyStateStatus {
  if (difference === null || permissibleLimit === null) return '';
  return difference <= permissibleLimit ? 'Sat' : 'Unsat';
}

/** Permissible voltage range span = 5% of rated voltage. */
export function calculateVoltageRangePermissibleLimit(ratedVoltage: number | null): number | null {
  if (ratedVoltage === null || ratedVoltage === 0) return null;
  return ratedVoltage * 0.05;
}

export interface ParallelingSharingCalculated {
  combinedVal: number | null;
  proportionateA: number | null;
  proportionateB: number | null;
  difference: number | null;
  toleranceBand: number | null;
}

/** kW / kVAr sharing calculations for unattended paralleling trial rows. */
export function calculateParallelingSharing(
  loadPercent: number,
  ratedA: number | null,
  ratedB: number | null,
  machineA: number | null,
  machineB: number | null,
): ParallelingSharingCalculated {
  if (ratedA === null || ratedB === null) {
    return {
      combinedVal: null,
      proportionateA: null,
      proportionateB: null,
      difference: null,
      toleranceBand: null,
    };
  }

  const factor = loadPercent / 100;
  const combinedRated = ratedA + ratedB;
  const combinedVal = factor * combinedRated;
  const proportionateA = factor * ratedA;
  const proportionateB = factor * ratedB;
  const toleranceBand = 0.1 * ((ratedA + ratedB) / 2);

  let difference: number | null = null;
  if (machineA !== null && machineB !== null) {
    difference = Math.max(
      Math.abs(proportionateA - machineA),
      Math.abs(proportionateB - machineB),
    );
  }

  return { combinedVal, proportionateA, proportionateB, difference, toleranceBand };
}

export function evaluateParallelingSharingStatus(
  difference: number | null,
  toleranceBand: number | null,
): SteadyStateStatus {
  if (difference === null || toleranceBand === null) return '';
  return difference <= toleranceBand ? 'Sat' : 'Unsat';
}

/** Load-up steps (0→25, 0→50, …) use 99.5%; load-down steps use 100.5%. */
export function isTransientLoadIncrease(loadInitial: string, loadTo: string): boolean {
  const from = Number(loadInitial);
  const to = Number(loadTo);
  return Number.isFinite(from) && Number.isFinite(to) && to > from;
}

/** Load up: Final Speed × 99.5 / 100; Load down: Final Speed × 100.5 / 100 */
export function calculateTransientRecoveryFinalValue(
  finalSpeed: number | null,
  loadInitial: string,
  loadTo: string,
): number | null {
  if (finalSpeed === null) return null;
  const factor = isTransientLoadIncrease(loadInitial, loadTo) ? 99.5 / 100 : 100.5 / 100;
  return finalSpeed * factor;
}

export function isMechanicalGovernor(governorType: unknown): boolean {
  return governorTypeLabel(governorType).includes('mechanical');
}

export function isElectronicOrNonWeaponGovernor(governorType: unknown): boolean {
  const type = governorTypeLabel(governorType);
  return type.includes('electronic') || type.includes('non-weapon') || type.includes('non weapon');
}

function governorTypeLabel(governorType: unknown): string {
  if (governorType && typeof governorType === 'object') {
    const value = governorType as { value?: unknown; label?: unknown };
    return String(value.value ?? value.label ?? '').toLowerCase();
  }
  return String(governorType ?? '').toLowerCase();
}

/** Mechanical ±3%; Electronic / Non-Weapon ±1% of rated frequency. */
export function calculateGovernorRangeLimits(
  governorType: unknown,
  ratedFrequency: number | null,
): { low: number; high: number } | null {
  if (ratedFrequency === null || ratedFrequency === 0) return null;
  if (!governorTypeLabel(governorType)) return null;
  if (isMechanicalGovernor(governorType)) {
    return { low: ratedFrequency * 0.97, high: ratedFrequency * 1.03 };
  }
  return { low: ratedFrequency * 0.99, high: ratedFrequency * 1.01 };
}

export function evaluateGovernorRangeStatus(
  measuredFrequency: number | null,
  limits: { low: number; high: number } | null,
): SteadyStateStatus {
  if (measuredFrequency === null || !limits) return '';
  return measuredFrequency >= limits.low && measuredFrequency <= limits.high ? 'Sat' : 'Unsat';
}

export const GOVERNOR_RATE_MIN_HZ_PER_SEC = 0.15;
export const GOVERNOR_RATE_MAX_HZ_PER_SEC = 0.25;

/** Sat if (0.15 ≤ Up ≤ 0.25) AND (0.15 ≤ Down ≤ 0.25). */
export function evaluateGovernorRateStatus(
  rateUp: number | null,
  rateDown: number | null,
): SteadyStateStatus {
  if (rateUp === null || rateDown === null) return '';
  const inBand = (value: number) =>
    value >= GOVERNOR_RATE_MIN_HZ_PER_SEC && value <= GOVERNOR_RATE_MAX_HZ_PER_SEC;
  return inBand(rateUp) && inBand(rateDown) ? 'Sat' : 'Unsat';
}

/** Low = Rated − 5%; High = Rated + 5%. */
export function calculateVoltageRangeBounds(
  ratedVoltage: number | null,
): { low: number; high: number } | null {
  if (ratedVoltage === null) return null;
  const delta = (ratedVoltage * 5) / 100;
  return { low: ratedVoltage - delta, high: ratedVoltage + delta };
}

export function formatVoltageRangePermissibleLimit(
  bounds: { low: number; high: number } | null,
): string {
  if (!bounds) return '';
  return `${roundFrequencyCalculation(bounds.low)} – ${roundFrequencyCalculation(bounds.high)}`;
}

/** Sat if both trimmer readings sit inside [Low, High]. */
export function evaluateVoltageRangeStatus(
  lowestTrimmer: number | null,
  highestTrimmer: number | null,
  bounds: { low: number; high: number } | null,
): SteadyStateStatus {
  if (lowestTrimmer === null || highestTrimmer === null || !bounds) return '';
  const inRange = (value: number) => value >= bounds.low && value <= bounds.high;
  return inRange(lowestTrimmer) && inRange(highestTrimmer) ? 'Sat' : 'Unsat';
}
