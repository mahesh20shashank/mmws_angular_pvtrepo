import {
  BREAKER_PROTECTION_ROWS,
  GTG_PANEL_CHECK_ROWS,
  GtgPanelCheckRow,
  GENERATOR_SWITCHBOARD_PROTECTION_ROWS,
  INSTRUMENTATION_ROWS,
  InstrumentationRow,
  MISCELLANEOUS_CHECK_ROWS,
  MiscellaneousCheckRow,
  ProtectionCheckRow,
} from './load-trial-proforma-gtg.data';
import {
  EtmaKeyValueGroup,
  EtmaMatrixColumn,
  EtmaMatrixSection,
  EtmaSerialKeyValueRow,
} from '../etma-proforma-table/etma-proforma-table.types';

export const EQUIPMENT_DETAILS_GROUPS: EtmaKeyValueGroup[] = [
  {
    title: 'Engine',
    labelWidth: 'w-40',
    rows: [
      { label: '(a) Make', formControlName: 'engine_make', required: true, placeholder: 'Enter engine make' },
      {
        label: '(b) Model & serial no.',
        formControlName: 'engine_model_serial_no',
        required: true,
        placeholder: 'Enter engine model & serial no.',
      },
      {
        label: '(c) RPM',
        formControlName: 'engine_rpm',
        inputType: 'number',
        required: true,
        min: 0,
        step: 1,
        placeholder: 'Enter RPM',
      },
    ],
  },
  {
    title: 'Governor',
    labelWidth: 'w-40',
    rows: [
      { label: '(a) Make', formControlName: 'governor_make', required: true, placeholder: 'Enter governor make' },
      {
        label: '(b) Model & serial no.',
        formControlName: 'governor_model_serial_no',
        required: true,
        placeholder: 'Enter governor model & serial no.',
      },
      {
        label: '(c) Type',
        formControlName: 'governor_type',
        required: true,
        controlType: 'radio',
        radioOptions: [
          { label: 'Electronic Governor', value: 'Electronic Governor' },
          { label: 'Mechanical Governor', value: 'Mechanical Governor' },
          { label: 'For Non Weapon Platform', value: 'For Non Weapon Platform' },
        ],
      },
    ],
  },
  {
    title: 'Alternator',
    labelWidth: 'w-56',
    rows: [
      {
        label: '(a) Make and rating',
        formControlName: 'alternator_make_and_rating',
        required: true,
        placeholder: 'Enter make and rating',
      },
      {
        label: '(b) Model & serial no.',
        formControlName: 'alternator_model_serial_no',
        required: true,
        placeholder: 'Enter model & serial no.',
      },
      {
        label: '(c) Rated voltage',
        formControlName: 'alternator_rated_voltage',
        inputType: 'number',
        required: true,
        min: 0,
        placeholder: 'Enter rated voltage',
      },
      {
        label: '(d) Rated frequency',
        formControlName: 'alternator_rated_frequency',
        inputType: 'number',
        required: true,
        min: 0,
        placeholder: 'Enter rated frequency',
      },
      {
        label: '(e) Rated kVA kW',
        formControlName: 'alternator_rated_kva_kw',
        inputType: 'number',
        required: true,
        min: 0,
        placeholder: 'Enter rated kVA/kW',
      },
      {
        label: '(f) Rated current',
        formControlName: 'alternator_rated_current',
        inputType: 'number',
        required: true,
        min: 0,
        placeholder: 'Enter rated current',
      },
      {
        label: '(g) Bearing number',
        formControlName: 'alternator_bearing_number',
        required: true,
        placeholder: 'Enter bearing number',
      },
    ],
  },
  {
    title: 'AVR',
    labelWidth: 'w-56',
    rows: [
      {
        label: '(a) Make and type',
        formControlName: 'avr_make_and_type',
        required: true,
        placeholder: 'Enter make and type',
      },
      {
        label: '(b) Model & serial no.',
        formControlName: 'avr_model_serial_no',
        required: true,
        placeholder: 'Enter model & serial no.',
      },
    ],
  },
  {
    title: 'Supply Breaker',
    labelWidth: 'w-56',
    rows: [
      {
        label: '(a) Make',
        formControlName: 'supply_breaker_make',
        required: true,
        placeholder: 'Enter supply breaker make',
      },
      {
        label: '(b) Model & serial no.',
        formControlName: 'supply_breaker_model_serial_no',
        required: true,
        placeholder: 'Enter supply breaker model & serial no.',
      },
      {
        label: '(c) Rated capacity (Amps)',
        formControlName: 'supply_breaker_rated_capacity_amps',
        inputType: 'number',
        required: true,
        min: 0,
        placeholder: 'Enter rated capacity (Amps)',
      },
    ],
  },
];

export const INSULATION_RESISTANCE_ROWS: EtmaSerialKeyValueRow[] = [
  {
    ser: '(a)',
    label: 'Generator hot (>1MΩ)',
    formControlName: 'insulation_generator_hot',
    required: true,
    placeholder: 'Enter generator hot (MΩ)',
  },
  {
    ser: '(b)',
    label: 'Generator cold (>1MΩ)',
    formControlName: 'insulation_generator_cold',
    required: true,
    placeholder: 'Enter generator cold (MΩ)',
  },
  {
    ser: '(c)',
    label: 'Switchboard (>2MΩ)',
    formControlName: 'insulation_switchboard',
    required: true,
    placeholder: 'Enter switchboard (MΩ)',
  },
  {
    ser: '(d)',
    label: 'Generator to switchboard cable (>20MΩ)',
    formControlName: 'insulation_generator_to_switchboard_cable',
    required: true,
    placeholder: 'Enter generator to switchboard cable (MΩ)',
  },
  {
    ser: '(e)',
    label: 'Insulation of breaker (>10MΩ)',
    formControlName: 'insulation_breaker',
    required: true,
    placeholder: 'Enter insulation of breaker (MΩ)',
  },
];

export const PROTECTION_CHECK_COLUMNS: EtmaMatrixColumn[] = [
  { id: 'ser', header: 'SNo.', cellType: 'static-ser' },
  { id: 'protection', header: 'Protection', cellType: 'static-protection' },
  { id: 'calibration_date', header: 'Calibration Date', required: true, cellType: 'calendar', formControl: 'calibration_date' },
  {
    id: 'calibration_cert_provided',
    header: 'Calibration Certificate Provided (Yes/No)',
    required: true,
    cellType: 'radio-yes-no',
    formControl: 'calibration_cert_provided',
  },
  { id: 'trippingValue', header: 'Tripping Value', required: true, cellType: 'static-tripping' },
  {
    id: 'observed_value',
    header: 'Observed Value',
    required: true,
    cellType: 'input-number',
    formControl: 'observed_value',
    placeholder: 'Enter observed value',
    min: 0,
  },
  { id: 'status', header: 'Status', required: true, cellType: 'radio-sat-unsat', formControl: 'status' },
  { id: 'remarks', header: 'Remarks', cellType: 'input-text', formControl: 'remarks', placeholder: 'Enter remarks' },
  { id: 'upload_file', header: 'Upload File', cellType: 'file-upload', formControl: 'upload_file' },
];

export const PROTECTION_CHECK_SECTIONS: EtmaMatrixSection<ProtectionCheckRow>[] = [
  { formArrayName: 'breaker_protection', groupTitle: 'Breaker Protection', rows: BREAKER_PROTECTION_ROWS },
  {
    formArrayName: 'generator_switchboard_protection',
    groupTitle: 'Generator/ Switchboard Protection',
    rows: GENERATOR_SWITCHBOARD_PROTECTION_ROWS,
  },
];

export const INSTRUMENTATION_COLUMNS: EtmaMatrixColumn[] = [
  { id: 'ser', header: 'SNo.', cellType: 'static-ser' },
  { id: 'meter', header: 'Meter', cellType: 'static-meter' },
  { id: 'ops_non_ops', header: 'Ops/ Non Ops', required: true, cellType: 'radio-ops-non-ops', formControl: 'ops_non_ops' },
  { id: 'calibration_date', header: 'Calibration Date', required: true, cellType: 'calendar', formControl: 'calibration_date' },
  {
    id: 'calibration_cert_provided',
    header: 'Calibration Certificate Provided (Yes/ No)',
    required: true,
    cellType: 'radio-yes-no',
    formControl: 'calibration_cert_provided',
  },
  { id: 'status', header: 'Status(Sat/ Unsat)', required: true, cellType: 'radio-sat-unsat', formControl: 'status' },
  { id: 'remarks', header: 'Remarks', cellType: 'input-text', formControl: 'remarks', placeholder: 'Enter remarks' },
  { id: 'upload_file', header: 'Upload File', cellType: 'file-upload', formControl: 'upload_file' },
];

export const INSTRUMENTATION_SECTIONS: EtmaMatrixSection<InstrumentationRow>[] = [
  { formArrayName: 'instrumentation', rows: INSTRUMENTATION_ROWS },
];

export const GTG_PANEL_COLUMNS: EtmaMatrixColumn[] = [
  { id: 'ser', header: 'SNo.', cellType: 'static-ser' },
  { id: 'observation', header: 'Observations', cellType: 'static-observation' },
  { id: 'status', header: 'Status(Sat/Unsat)', required: true, cellType: 'dynamic-status' },
];

export const GTG_PANEL_SECTIONS: EtmaMatrixSection<GtgPanelCheckRow>[] = [
  { formArrayName: 'gtg_panel_checks', rows: GTG_PANEL_CHECK_ROWS },
];

export const MISCELLANEOUS_COLUMNS: EtmaMatrixColumn[] = [
  { id: 'ser', header: 'SNo.', cellType: 'static-ser' },
  { id: 'observation', header: 'Observations', cellType: 'static-observation' },
  { id: 'details', header: 'Details', cellType: 'dynamic-details', formControl: 'details' },
  { id: 'remarks', header: 'Remarks', cellType: 'input-text', formControl: 'remarks', placeholder: 'Enter remarks' },
  { id: 'upload_file', header: 'Upload File', cellType: 'file-upload', formControl: 'upload_file' },
];

export const MISCELLANEOUS_SECTIONS: EtmaMatrixSection<MiscellaneousCheckRow>[] = [
  { formArrayName: 'miscellaneous_checks', rows: MISCELLANEOUS_CHECK_ROWS },
];
