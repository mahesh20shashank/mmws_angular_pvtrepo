export interface ProtectionCheckRow {
  ser: string;
  protection: string;
  trippingValue: string;
  group?: string;
}

export interface InstrumentationRow {
  ser: string;
  meter: string;
}

export interface GtgPanelCheckRow {
  ser: string;
  observation: string;
  detailsType?: 'yes_no';
}

export type MiscDetailsType = 'text' | 'sat_unsat' | 'yes_no' | 'avl_na' | 'ops_non_ops' | 'date';

export interface MiscellaneousCheckRow {
  ser: string;
  observation: string;
  detailsType: MiscDetailsType;
  /** 1 = *, 2 = **, 3 = *** */
  mark?: 1 | 2 | 3;
}

export interface SteadyStateLoadRow {
  loadPercent: string;
  showDroop?: boolean;
  /** When true, governor droop is auto-calculated from no-load / full-load frequencies. */
  calculatedDroop?: boolean;
  droopValue?: string;
  permissibleLimit?: string;
  frequencyModulationNA?: boolean;
}

export const BREAKER_PROTECTION_ROWS: ProtectionCheckRow[] = [
  { ser: '(a)', protection: 'Over voltage', trippingValue: '110% of rated voltage', group: 'Breaker Protection' },
  { ser: '(b)', protection: 'Under voltage', trippingValue: '85% of rated voltage', group: 'Breaker Protection' },
  { ser: '(c)', protection: 'Over load', trippingValue: '125% of rated voltage', group: 'Breaker Protection' },
];

export const GENERATOR_SWITCHBOARD_PROTECTION_ROWS: ProtectionCheckRow[] = [
  { ser: '(a)', protection: 'Over voltage trip', trippingValue: '110% of rated voltage', group: 'Generator/ Switchboard Protection' },
  { ser: '(b)', protection: 'Under voltage trip', trippingValue: '85% of rated voltage', group: 'Generator/ Switchboard Protection' },
  { ser: '(c)', protection: 'Reverse power relay', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
  { ser: '(d)', protection: 'Winding temp alarm', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
];

export const INSTRUMENTATION_ROWS: InstrumentationRow[] = [
  { ser: '(a)', meter: 'kW meter' },
  { ser: '(b)', meter: 'Voltmeter' },
  { ser: '(c)', meter: 'Ammeter' },
  { ser: '(d)', meter: 'Frequency Meter' },
  { ser: '(e)', meter: 'Power factor meter' },
];

export const GTG_PANEL_CHECK_ROWS: GtgPanelCheckRow[] = [
  { ser: '(a)', observation: 'Condition of cables (Sat/ Unsat)' },
  { ser: '(b)', observation: 'Cleanliness (Sat/ Unsat)' },
  {
    ser: '(c)',
    observation: 'Instrumentation (Date of calibration and certificate available - Yes/ No)',
    detailsType: 'yes_no',
  },
];

export const MISCELLANEOUS_CHECK_ROWS: MiscellaneousCheckRow[] = [
  { ser: '(a)', observation: 'Main stator resistance checks', detailsType: 'text', mark: 3 },
  { ser: '(b)', observation: 'Main rotor resistance checks', detailsType: 'text', mark: 3 },
  { ser: '(c)', observation: 'Exciter stator resistance checks', detailsType: 'text', mark: 3 },
  { ser: '(d)', observation: 'Exciter rotor resistance checks', detailsType: 'text', mark: 3 },
  { ser: '(e)', observation: 'Check condition of slip ring (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 1 },
  { ser: '(f)', observation: 'Check condition of zinc plugs (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(g)', observation: 'Anti-condensation heater (Ops/ Non ops)', detailsType: 'ops_non_ops', mark: 1 },
  { ser: '(h)', observation: 'GTTT trial status (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(j)', observation: 'Internal communication (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(k)', observation: 'Lighting of compartment (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(l)', observation: 'Ventilation of compartment (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 1 },
  {
    ser: '(m)',
    observation: 'Generator terminal box and top cover nuts and bolts cover are secured (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 1,
  },
  {
    ser: '(n)',
    observation: 'Loose cables / wires of various instrumentation secured (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 1,
  },
  { ser: '(p)', observation: 'Generator Swbd is earthed (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  {
    ser: '(q)',
    observation: 'Generator supply breaker operates electrically (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 2,
  },
  { ser: '(r)', observation: 'Ambient temperature at start', detailsType: 'text', mark: 2 },
];

export interface TransientTestLoadRow {
  loadInitial: string;
  loadTo: string;
}

export const TRANSIENT_TEST_LOAD_ROWS: TransientTestLoadRow[] = [
  { loadInitial: '0', loadTo: '25' },
  { loadInitial: '25', loadTo: '50' },
  { loadInitial: '50', loadTo: '75' },
  { loadInitial: '75', loadTo: '100' },
  { loadInitial: '100', loadTo: '75' },
  { loadInitial: '75', loadTo: '50' },
  { loadInitial: '50', loadTo: '25' },
  { loadInitial: '25', loadTo: '0' },
];

/** GTG section 9 – load steps for PHM (RCHM) steady-state ON table. */
export const GTG_STEADY_STATE_LOAD_ROWS = ['0', '25', '50', '75', '110'] as const;

export interface GtgSteadyStateOffRowConfig {
  loadLabel: string;
  calculatedDroop?: boolean;
  droopPermissibleText?: string;
  frequencyModulationNA?: boolean;
}

/** Index of the 100–0 governor droop row in {@link GTG_STEADY_STATE_OFF_ROWS}. */
export const GTG_GOVERNOR_DROOP_ROW_INDEX = 5;

/** GTG section 9 – PHM OFF steady-state rows including governor droop row. */
export const GTG_STEADY_STATE_OFF_ROWS: GtgSteadyStateOffRowConfig[] = [
  { loadLabel: '0' },
  { loadLabel: '25' },
  { loadLabel: '50' },
  { loadLabel: '75' },
  { loadLabel: '110' },
  {
    loadLabel: '100 – 0(Governor Droop)',
    calculatedDroop: true,
    droopPermissibleText: 'Between 2 to 4%',
    frequencyModulationNA: true,
  },
];

export interface GtgPhmTransientRow {
  loadInitial: string;
  loadTo: string;
  peakPermissibleLimit?: string;
  peakLimitRowspan?: number;
  recoveryPermissibleLimit?: string;
  recoveryLimitRowspan?: number;
}

export const GTG_PHM_TRANSIENT_ON_ROWS: GtgPhmTransientRow[] = [
  {
    loadInitial: '0',
    loadTo: '25',
    peakPermissibleLimit: 'Not Specified',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: 'Not Specified',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '25', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '50',
    peakPermissibleLimit: '± 1%',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '3',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '50', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '75',
    peakPermissibleLimit: 'Not Specified',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: 'Not Specified',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '75', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '100',
    peakPermissibleLimit: '± 2%',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '5',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '100', loadTo: '0' },
];

export const GTG_PHM_TRANSIENT_OFF_ROWS: GtgPhmTransientRow[] = [
  {
    loadInitial: '0',
    loadTo: '25',
    peakPermissibleLimit: 'Not Specified',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '2',
    recoveryLimitRowspan: 4,
  },
  { loadInitial: '25', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '50',
    peakPermissibleLimit: '± 5%',
    peakLimitRowspan: 2,
  },
  { loadInitial: '50', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '75',
    peakPermissibleLimit: 'Not Specified',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '15',
    recoveryLimitRowspan: 4,
  },
  { loadInitial: '75', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '100',
    peakPermissibleLimit: '± 5%',
    peakLimitRowspan: 2,
  },
  { loadInitial: '100', loadTo: '0' },
];

/** GTG section 10 – steady-state voltage load steps. */
export const GTG_VOLTAGE_STEADY_STATE_LOAD_ROWS = ['0', '25', '50', '75', '110'] as const;

export interface GtgVoltageTransientRow {
  loadInitial: string;
  loadTo: string;
  peakPermissibleLimit?: string;
  peakLimitRowspan?: number;
  recoveryPermissibleLimit?: string;
  recoveryLimitRowspan?: number;
  isMload?: boolean;
}

export const GTG_VOLTAGE_TRANSIENT_ROWS: GtgVoltageTransientRow[] = [
  {
    loadInitial: '0',
    loadTo: '25',
    peakPermissibleLimit: '± 7.5%',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '1',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '25', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '50',
    peakPermissibleLimit: '13%',
    recoveryPermissibleLimit: '0.5',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '50', loadTo: '0', peakPermissibleLimit: '10%' },
  {
    loadInitial: '0',
    loadTo: '75',
    peakPermissibleLimit: '± 7.5%',
    peakLimitRowspan: 2,
    recoveryPermissibleLimit: '1',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '75', loadTo: '0' },
  {
    loadInitial: '0',
    loadTo: '100',
    peakPermissibleLimit: '22%',
    recoveryPermissibleLimit: '0.8',
    recoveryLimitRowspan: 2,
  },
  { loadInitial: '100', loadTo: '0', peakPermissibleLimit: '20%' },
  {
    loadInitial: '0+M',
    loadTo: '',
    peakPermissibleLimit: '15%',
    peakLimitRowspan: 5,
    recoveryPermissibleLimit: '1',
    recoveryLimitRowspan: 5,
    isMload: true,
  },
  { loadInitial: '25+M', loadTo: '', isMload: true },
  { loadInitial: '50+M', loadTo: '', isMload: true },
  { loadInitial: '75+M', loadTo: '', isMload: true },
  { loadInitial: '85+M', loadTo: '', isMload: true },
];

export const STEADY_STATE_LOAD_ROWS: SteadyStateLoadRow[] = [
  { loadPercent: '100' },
  { loadPercent: '75' },
  { loadPercent: '50' },
  { loadPercent: '25' },
  {
    loadPercent: '0',
    showDroop: true,
    droopValue: 'NA',
    permissibleLimit:
      'Load range tolerance – 1Hz or 2% of rated value Constant load tolerance -0.5Hz or 1% of rated value',
  },
  { loadPercent: '25' },
  { loadPercent: '50' },
  { loadPercent: '75' },
  { loadPercent: '100' },
  {
    loadPercent: '100 - 0 (Governor Droop)',
    calculatedDroop: true,
    permissibleLimit:
      '- Between 0.75% to 1% (For Electronic Governors)\n- Between 3.5% to 4% (for Mechanical Governors)\n- Upto 3% onboard Tejas and Talwar class ships.\n(No load freq-full load freq /100)Nominal freq',
    frequencyModulationNA: true,
  },
];
