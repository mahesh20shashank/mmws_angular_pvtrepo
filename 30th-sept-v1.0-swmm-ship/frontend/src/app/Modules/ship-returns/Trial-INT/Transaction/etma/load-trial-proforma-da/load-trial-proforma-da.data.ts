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

export interface DaPanelCheckRow {
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
  {
    ser: '(c)',
    protection: 'Over load',
    trippingValue: 'NA',
    group: 'Breaker Protection',
  },
];

export const GENERATOR_SWITCHBOARD_PROTECTION_ROWS: ProtectionCheckRow[] = [
  { ser: '(a)', protection: 'Over voltage trip', trippingValue: '110% of rated voltage', group: 'Generator/ Switchboard Protection' },
  { ser: '(b)', protection: 'Under voltage trip', trippingValue: '85% of rated voltage', group: 'Generator/ Switchboard Protection' },
  { ser: '(c)', protection: 'Reverse power relay', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
  { ser: '(d)', protection: 'Diode failure trip', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
  { ser: '(e)', protection: 'Winding temp alarm', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
  { ser: '(f)', protection: 'Bearing temp alarm', trippingValue: 'NA', group: 'Generator/ Switchboard Protection' },
];

export const INSTRUMENTATION_ROWS: InstrumentationRow[] = [
  { ser: '(a)', meter: 'kW meter' },
  { ser: '(b)', meter: 'Voltmeter' },
  { ser: '(c)', meter: 'Ammeter' },
  { ser: '(d)', meter: 'Frequency Meter' },
  { ser: '(e)', meter: 'Power factor meter' },
];

export const DA_PANEL_CHECK_ROWS: DaPanelCheckRow[] = [
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
  { ser: '(e)', observation: 'SPM of bearing (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 1 },
  { ser: '(f)', observation: 'Temp of bearing after trial (< 93 degC) (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 1 },
  { ser: '(g)', observation: 'Lubricant used', detailsType: 'yes_no', mark: 2 },
  { ser: '(h)', observation: 'Greasing instruction on DA (Avl/ NA)', detailsType: 'avl_na', mark: 1 },
  { ser: '(j)', observation: 'Anti-condensation heater (Ops/ Non ops)', detailsType: 'ops_non_ops', mark: 1 },
  { ser: '(k)', observation: 'Date of RRA replacement', detailsType: 'date', mark: 2 },
  { ser: '(l)', observation: 'DTTT trial status (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(m)', observation: 'Internal communication (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(n)', observation: 'Lighting of compartment (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  { ser: '(p)', observation: 'Ventilation of compartment (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 1 },
  {
    ser: '(q)',
    observation: 'Generator terminal box and top cover nuts and bolts cover are secured (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 1,
  },
  {
    ser: '(r)',
    observation: 'Loose cables / wires of various Instrumentation secured (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 1,
  },
  { ser: '(s)', observation: 'Generator/ Swbd is earthed (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
  {
    ser: '(t)',
    observation: 'Generator supply breaker operates electrically (Sat/ Unsat)',
    detailsType: 'sat_unsat',
    mark: 2,
  },
  { ser: '(u)', observation: 'Last Pressure checks undertaken (date)', detailsType: 'date', mark: 2 },
  { ser: '(v)', observation: 'Check condition of zinc plugs (Sat/ Unsat)', detailsType: 'sat_unsat', mark: 2 },
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
      '- Between 0.87% to 1% (For Electronic Governors)\n- Between 3.5% to 4% (for Mechanical Governors)\n- Upto 3% onboard Tejas and Talwar class ships.\n(Final Speed − Initial Speed) × 100 / Nominal Frequency',
    frequencyModulationNA: true,
  },
];
