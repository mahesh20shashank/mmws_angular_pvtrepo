/** Row indices in {@link STEADY_STATE_LOAD_ROWS} for speed-control calculations. */
export const STEADY_STATE_ROW_INDEX = {
  FULL_LOAD: 0,
  NO_LOAD: 4,
  GOVERNOR_DROOP: 9,
} as const;

export function parseFrequency(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when a speed/Hz field is typed and not 0. Empty is not treated as 0. */
export function isFilledNonZeroFrequency(value: unknown): boolean {
  const parsed = parseFrequency(value);
  return parsed !== null && parsed !== 0;
}

export function roundFrequencyCalculation(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type SteadyStateStatus = 'Sat' | 'Unsat' | '';

function shipLabel(ship: unknown): string {
  return String(ship ?? '').toLowerCase();
}

/** Tejas / Teg / Talwar class ships use the 0–3% droop band. */
export function isTegTalwarClass(ship: unknown): boolean {
  const label = shipLabel(ship);
  return /\btejas\b/.test(label) || /\btalwar\b/.test(label) || /\bteg\b/.test(label);
}

/** CAR NICOBAR (WJFAC) uses a 3% peak limit on 25% speed-transient steps. */
export function isCarNicobarWjfac(ship: unknown): boolean {
  const compact = shipLabel(ship).replace(/[\s_-]+/g, '');
  return compact.includes('carnicobar') || compact.includes('wjfac');
}

export function isMechanicalGovernor(governorType: unknown): boolean {
  return String(governorType ?? '').toLowerCase().includes('mechanical');
}

export function isElectronicGovernor(governorType: unknown): boolean {
  return String(governorType ?? '').toLowerCase().includes('electronic');
}

export function isWeaponGovernor(governorType: unknown): boolean {
  const type = String(governorType ?? '').toLowerCase();
  return type.includes('weapon') || type.includes('non-weapon') || type.includes('non weapon');
}

/** Nominal frequency = (No load frequency + Full load frequency) / 2 */
export function calculateNominalFrequency(
  noLoadFrequency: number | null,
  fullLoadFrequency: number | null,
): number | null {
  if (noLoadFrequency === null || fullLoadFrequency === null) return null;
  return (noLoadFrequency + fullLoadFrequency) / 2;
}

/** droop % = (Final Speed − Initial Speed) × 100 / Nominal Frequency */
export function calculateGovernorDroop(
  initialSpeed: number | null,
  finalSpeed: number | null,
  nominalFrequency: number | null,
): number | null {
  if (
    initialSpeed === null ||
    finalSpeed === null ||
    nominalFrequency === null ||
    nominalFrequency === 0
  ) {
    return null;
  }
  return ((finalSpeed - initialSpeed) * 100) / nominalFrequency;
}

/** Frequency modulation = |(Initial Speed − Final Speed) / Nominal Frequency| × 50 */
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

/** Permissible limit: 0 to ± 0.25% of rated frequency. */
export const FREQUENCY_MODULATION_SAT_LIMIT_PERCENT = 0.25;

/** Sat when modulation is 0 to 0.25 inclusive; blank when modulation is blank. */
export function evaluateFrequencyModulationStatus(
  modulationPercent: number | null,
): SteadyStateStatus {
  if (modulationPercent === null) return '';
  return modulationPercent >= 0 && modulationPercent <= FREQUENCY_MODULATION_SAT_LIMIT_PERCENT
    ? 'Sat'
    : 'Unsat';
}

/**
 * Mechanical (not Teg/Talwar): 3.5 to 4.
 * Electronic (not Teg/Talwar): 0.87 to 1.
 * Teg / Talwar class: 0 to 3.
 * Otherwise Unsat.
 */
export function evaluateGovernorDroopStatus(
  droopPercent: number | null,
  governorType: string,
  ship?: unknown,
): SteadyStateStatus {
  if (droopPercent === null) return '';

  let minimum: number | null = null;
  let maximum: number | null = null;

  if (isTegTalwarClass(ship)) {
    minimum = 0;
    maximum = 3;
  } else if (isMechanicalGovernor(governorType)) {
    minimum = 3.5;
    maximum = 4;
  } else if (isElectronicGovernor(governorType)) {
    minimum = 0.87;
    maximum = 1;
  }

  if (minimum === null || maximum === null) return 'Unsat';
  return droopPercent >= minimum && droopPercent <= maximum ? 'Sat' : 'Unsat';
}

/**
 * Peak % = |Initial − Momentary| × 100 / Nominal.
 * Runs only when Initial and Momentary are both filled and not 0.
 * Empty fields stay blank — they are not treated as 0.
 */
export function calculatePeakPercent(
  initialSpeedHz: number | null,
  momentarySpeedHz: number | null,
  nominalFrequency: number | null,
): number | null {
  if (
    initialSpeedHz === null ||
    momentarySpeedHz === null ||
    initialSpeedHz === 0 ||
    momentarySpeedHz === 0 ||
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

const SPEED_TRANSIENT_LOAD_ON = new Set([
  '0-25',
  '25-50',
  '50-75',
  '75-100',
  '0-70',
  '0-50',
  '0-100',
  '50-100',
]);

const SPEED_TRANSIENT_LOAD_OFF = new Set([
  '100-75',
  '75-50',
  '50-25',
  '25-0',
  '100-0',
]);

function loadStepKey(loadInitial: unknown, loadTo: unknown): string {
  return `${String(loadInitial ?? '').replace(/%/g, '').trim()}-${String(loadTo ?? '')
    .replace(/%/g, '')
    .trim()}`;
}

/** Load-on steps use 99.8%; listed load-off steps use 100.2%. */
export function isSpeedTransientLoadOn(loadInitial: unknown, loadTo: unknown): boolean {
  const key = loadStepKey(loadInitial, loadTo);
  if (SPEED_TRANSIENT_LOAD_OFF.has(key)) return false;
  if (SPEED_TRANSIENT_LOAD_ON.has(key)) return true;
  const from = Number(String(loadInitial ?? '').replace(/%/g, ''));
  const to = Number(String(loadTo ?? '').replace(/%/g, ''));
  return Number.isFinite(from) && Number.isFinite(to) && to > from;
}

/** Load on: Final × 99.8 / 100; Load off: Final × 100.2 / 100. Blank when Final Speed is empty or 0. */
export function calculateRecoveryFinalValue(
  finalSpeedHz: number | null,
  loadInitial: unknown,
  loadTo: unknown,
): number | null {
  if (finalSpeedHz === null || finalSpeedHz === 0 || finalSpeedHz < 0) return null;
  const factor = isSpeedTransientLoadOn(loadInitial, loadTo) ? 99.8 / 100 : 100.2 / 100;
  return finalSpeedHz * factor;
}

export const ELECTRONIC_SPEED_TRANSIENT_PEAK_LIMIT_PERCENT = 1.5;
export const ELECTRONIC_SPEED_TRANSIENT_RECOVERY_LIMIT_SEC = 2;

/** Peak limit for 25% steps, filled from governor type / ship class. Electronic is always 1.5. */
export function speedTransientPeakLimitPercent(
  governorType: string,
  ship?: unknown,
): number | null {
  if (isElectronicGovernor(governorType)) return ELECTRONIC_SPEED_TRANSIENT_PEAK_LIMIT_PERCENT;
  if (isCarNicobarWjfac(ship)) return 3;
  if (isMechanicalGovernor(governorType)) return 2.5;
  if (isWeaponGovernor(governorType)) return 3.5;
  return null;
}

function inClosedRange(value: number, minimum: number, maximum: number): boolean {
  return value + Number.EPSILON >= minimum && value - Number.EPSILON <= maximum;
}

function satIfPeakZero(peakObserved: number | null): SteadyStateStatus | null {
  if (peakObserved === null) return '';
  if (peakObserved === 0) return 'Sat';
  return null;
}

/**
 * Electronic 25% steps (JSON num() rules):
 * empty init/mom → blank remarks (caller passes null peak)
 * Peak == 0 → Sat
 * Peak 0–limit AND Time 0–2 → Sat, else Unsat
 * Empty time is num() == 0, which is inside 0–2.
 */
export function evaluateSpeedTransient25PercentStatus(
  peakObserved: number | null,
  peakLimit: number | null,
  recoverySeconds: number | null,
): SteadyStateStatus {
  const peakZero = satIfPeakZero(peakObserved);
  if (peakZero !== null) return peakZero;
  if (peakLimit === null) return '';
  const time = recoverySeconds ?? 0;
  const peakPasses = inClosedRange(peakObserved as number, 0, peakLimit);
  const timePasses = inClosedRange(time, 0, ELECTRONIC_SPEED_TRANSIENT_RECOVERY_LIMIT_SEC);
  return peakPasses && timePasses ? 'Sat' : 'Unsat';
}

export type SpeedTransientSubsectionKey =
  | 'turbo_mg'
  | 'turbo_eg'
  | 'turbo_nwp'
  | 'turbo_sbc'
  | 'nonturbo_mg'
  | 'nonturbo_eg'
  | 'nonturbo_nwp'
  | 'nonturbo_sbc';

/**
 * Subsection Sat/Unsat. Peak = 0 is Sat. Missing initial/momentary (null peak) clears remark.
 */
export function evaluateSpeedTransientSubsectionStatus(
  subsectionKey: string,
  peakObserved: number | null,
  peakLimit: number | null,
  recoverySeconds: number | null,
): SteadyStateStatus {
  const peakZero = satIfPeakZero(peakObserved);
  if (peakZero !== null) return peakZero;

  const peak = peakObserved as number;
  const requirePeakUpTo = (limit: number | null, timeMin?: number, timeMax?: number): SteadyStateStatus => {
    if (limit === null) return '';
    const peakPasses = peak > 0 && peak <= limit;
    if (timeMax === undefined) return peakPasses ? 'Sat' : 'Unsat';
    const time = recoverySeconds ?? 0;
    const timePasses = inClosedRange(time, timeMin ?? 0, timeMax);
    return peakPasses && timePasses ? 'Sat' : 'Unsat';
  };

  switch (subsectionKey) {
    case 'turbo_mg':
      return requirePeakUpTo(10);
    case 'turbo_eg':
      return requirePeakUpTo(5, 0, 5);
    case 'turbo_nwp':
    case 'nonturbo_nwp':
      return requirePeakUpTo(10);
    case 'turbo_sbc':
    case 'nonturbo_sbc':
      return requirePeakUpTo(peakLimit);
    case 'nonturbo_mg':
      return requirePeakUpTo(10, 0, 2);
    case 'nonturbo_eg':
      return requirePeakUpTo(5, 0, 2);
    default:
      return requirePeakUpTo(peakLimit, 0, 2);
  }
}

/** Extracts seconds from labels such as "2 Sec" and "5 Sec". */
export function parseRecoveryLimitSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parsePercentLabel(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mechanical ±3%; Electronic (and other types) ±1% of rated frequency. */
export function calculateGovernorRangeLimits(
  governorType: unknown,
  ratedFrequency: number | null,
): { low: number; high: number } | null {
  if (ratedFrequency === null || ratedFrequency === 0) return null;
  if (!String(governorType ?? '').trim()) return null;
  const bandPercent = isMechanicalGovernor(governorType) ? 0.03 : 0.01;
  const band = ratedFrequency * bandPercent;
  return { low: ratedFrequency - band, high: ratedFrequency + band };
}

export function formatGovernorRangePermissibleLimit(
  limits: { low: number; high: number } | null,
): string {
  if (!limits) return '';
  return `${roundFrequencyCalculation(limits.low)} – ${roundFrequencyCalculation(limits.high)}`;
}

export function evaluateGovernorRangeStatus(
  measuredFrequency: number | null,
  limits: { low: number; high: number } | null,
): SteadyStateStatus {
  if (measuredFrequency === null || !limits) return '';
  return measuredFrequency >= limits.low && measuredFrequency <= limits.high ? 'Sat' : 'Unsat';
}

export function governorMotorRateBand(
  loadPercent: string | number,
  governorType: unknown,
): { min: number; max: number } | null {
  if (!String(governorType ?? '').trim()) return null;
  const load = String(loadPercent).replace('%', '').trim();
  if (isMechanicalGovernor(governorType)) {
    return { min: 0.2, max: 0.4 };
  }
  if (load === '0') return { min: 0.04, max: 0.07 };
  if (load === '100') return { min: 0.05, max: 0.07 };
  return { min: 0.04, max: 0.07 };
}

/** Both Up and Down must be in range. Empty side clears the remark. */
export function evaluateGovernorRateStatus(
  rateUp: number | null,
  rateDown: number | null,
  band: { min: number; max: number } | null,
): SteadyStateStatus {
  if (rateUp === null || rateDown === null || !band) return '';
  const inBand = (value: number) => inClosedRange(value, band.min, band.max);
  return inBand(rateUp) && inBand(rateDown) ? 'Sat' : 'Unsat';
}

/** Voltage modulation (%) = |(Vmax − Vmin) / Nominal Voltage| × 50 */
export function calculateVoltageModulation(
  voltsMax: number | null,
  voltsMin: number | null,
  nominalVoltage: number | null,
): number | null {
  if (voltsMax === null || voltsMin === null || nominalVoltage === null || nominalVoltage === 0) {
    return null;
  }
  return (Math.abs(voltsMax - voltsMin) / nominalVoltage) * 50;
}

export const VOLTAGE_MODULATION_SAT_LIMIT_PERCENT = 2;

export function evaluateVoltageModulationStatus(
  modulationPercent: number | null,
): SteadyStateStatus {
  if (modulationPercent === null) return '';
  return modulationPercent < VOLTAGE_MODULATION_SAT_LIMIT_PERCENT ? 'Sat' : 'Unsat';
}

export function isVoltageMotorStartRow(loadInitial: unknown): boolean {
  return String(loadInitial ?? '').toUpperCase().includes('M');
}

/** Load steps: Final × 101/100; motor start: Final × 99/100 */
export function calculateVoltageRecoveryFinalValue(
  finalVoltage: number | null,
  loadInitial: unknown,
): number | null {
  if (finalVoltage === null) return null;
  const factor = isVoltageMotorStartRow(loadInitial) ? 99 / 100 : 101 / 100;
  return finalVoltage * factor;
}

/**
 * Load steps: Peak > 0 and ≤ 7.5 and time > 0 and ≤ 1 s.
 * Motor start: Peak > 0 and ≤ 15 and time > 0 and ≤ 1 s.
 * Peak = 0 → Sat. Missing peak clears remark.
 */
export function evaluateVoltageTransientStatus(
  peakObserved: number | null,
  recoverySeconds: number | null,
  motorStart: boolean,
): SteadyStateStatus {
  const peakZero = satIfPeakZero(peakObserved);
  if (peakZero !== null) return peakZero;
  if (recoverySeconds === null) return '';
  const peakLimit = motorStart ? 15 : 7.5;
  const peakPasses = (peakObserved as number) > 0 && (peakObserved as number) <= peakLimit;
  const timePasses = recoverySeconds > 0 && recoverySeconds <= 1;
  return peakPasses && timePasses ? 'Sat' : 'Unsat';
}

/** Difference = max(RY, YB, BR) − min(RY, YB, BR) */
export function calculateVoltageBalanceDifference(
  ry: number | null,
  yb: number | null,
  br: number | null,
): number | null {
  if (ry === null || yb === null || br === null) return null;
  return Math.max(ry, yb, br) - Math.min(ry, yb, br);
}

/** Permissible = Average × 1% */
export function calculateVoltageBalancePermissibleLimit(
  ry: number | null,
  yb: number | null,
  br: number | null,
): number | null {
  if (ry === null || yb === null || br === null) return null;
  return ((ry + yb + br) / 3) * 0.01;
}

/** Sat if 0 < Difference ≤ Permissible */
export function evaluateVoltageBalanceStatus(
  difference: number | null,
  permissibleLimit: number | null,
): SteadyStateStatus {
  if (difference === null || permissibleLimit === null) return '';
  return difference > 0 && difference <= permissibleLimit ? 'Sat' : 'Unsat';
}

export function calculateVoltageRangeBounds(
  ratedVoltage: number | null,
  percent = 5,
): { low: number; high: number } | null {
  if (ratedVoltage === null) return null;
  const delta = (ratedVoltage * percent) / 100;
  return { low: ratedVoltage - delta, high: ratedVoltage + delta };
}

export function formatVoltageRangeBand(bounds: { low: number; high: number } | null): string {
  if (!bounds) return '';
  return `${roundFrequencyCalculation(bounds.low)} – ${roundFrequencyCalculation(bounds.high)}`;
}

/** ±1%, ±2% and ±5% bands used as displayed limits. Sat uses the ±5% band. */
export function formatVoltageRangeDisplayedLimits(ratedVoltage: number | null): string {
  const one = formatVoltageRangeBand(calculateVoltageRangeBounds(ratedVoltage, 1));
  const two = formatVoltageRangeBand(calculateVoltageRangeBounds(ratedVoltage, 2));
  const five = formatVoltageRangeBand(calculateVoltageRangeBounds(ratedVoltage, 5));
  if (!five) return '';
  return `±1%: ${one}\n±2%: ${two}\n±5%: ${five}`;
}

/** Both Lowest and Highest must lie in [min, max]. Empty side clears remark. */
export function evaluateVoltageRangeStatus(
  lowestTrimmer: number | null,
  highestTrimmer: number | null,
  bounds: { low: number; high: number } | null,
): SteadyStateStatus {
  if (lowestTrimmer === null || highestTrimmer === null || !bounds) return '';
  const inRange = (value: number) => value >= bounds.low && value <= bounds.high;
  return inRange(lowestTrimmer) && inRange(highestTrimmer) ? 'Sat' : 'Unsat';
}

export interface ParallelingSharingCalculated {
  combinedVal: number | null;
  proportionateA: number | null;
  proportionateB: number | null;
  difference: number | null;
  toleranceBand: number | null;
}

/**
 * Combined = (R1 + R2) × X / 100
 * Share A/B = R × X / 100
 * W = max(|Pa − Actual A|, |Pb − Actual B|)
 * Z = ((R1 + R2) / 2) × 10 / 100
 */
export function calculateParallelingSharing(
  loadPercent: number,
  ratedA: number | null,
  ratedB: number | null,
  actualA: number | null,
  actualB: number | null,
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
  const combinedVal = (ratedA + ratedB) * factor;
  const proportionateA = ratedA * factor;
  const proportionateB = ratedB * factor;
  const toleranceBand = ((ratedA + ratedB) / 2) * 0.1;

  let difference: number | null = null;
  if (actualA !== null && actualB !== null) {
    difference = Math.max(Math.abs(proportionateA - actualA), Math.abs(proportionateB - actualB));
  }

  return { combinedVal, proportionateA, proportionateB, difference, toleranceBand };
}

/** Sat if W ≤ Z, Unsat if W > Z. */
export function evaluateParallelingSharingStatus(
  difference: number | null,
  toleranceBand: number | null,
): SteadyStateStatus {
  if (difference === null || toleranceBand === null) return '';
  return difference <= toleranceBand ? 'Sat' : 'Unsat';
}
