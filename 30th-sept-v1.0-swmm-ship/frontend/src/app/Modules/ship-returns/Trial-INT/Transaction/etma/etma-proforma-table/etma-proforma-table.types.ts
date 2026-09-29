import { MiscDetailsType } from '../load-trial-proforma-da/load-trial-proforma-da.data';

export type EtmaTableVariant = 'grouped-key-value' | 'serial-key-value' | 'matrix';

export type EtmaMatrixCellType =
  | 'static-ser'
  | 'static-protection'
  | 'static-meter'
  | 'static-tripping'
  | 'static-observation'
  | 'calendar'
  | 'radio-yes-no'
  | 'radio-sat-unsat'
  | 'radio-ops-non-ops'
  | 'input-number'
  | 'input-text'
  | 'file-upload'
  | 'dynamic-status'
  | 'dynamic-details';

export interface EtmaRadioOption {
  label: string;
  value: string;
}

export interface EtmaMatrixColumn {
  id: string;
  header: string;
  required?: boolean;
  cellType: EtmaMatrixCellType;
  formControl?: string;
  placeholder?: string;
  min?: number;
}

export interface EtmaMatrixSection<T = Record<string, unknown>> {
  formArrayName: string;
  groupTitle?: string;
  rows: T[];
}

export interface EtmaKeyValueRow {
  label: string;
  formControlName: string;
  inputType?: 'text' | 'number';
  required?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
  controlType?: 'input' | 'radio';
  radioOptions?: EtmaRadioOption[];
}

export interface EtmaKeyValueGroup {
  title: string;
  labelWidth?: string;
  rows: EtmaKeyValueRow[];
}

export interface EtmaSerialKeyValueRow {
  ser: string;
  label: string;
  formControlName: string;
  required?: boolean;
  placeholder?: string;
}

export interface EtmaObservationRow {
  ser: string;
  observation: string;
  detailsType?: 'yes_no';
  mark?: 1 | 2 | 3;
}

export interface EtmaMiscRow {
  ser: string;
  observation: string;
  detailsType: MiscDetailsType;
  mark?: 1 | 2 | 3;
}
