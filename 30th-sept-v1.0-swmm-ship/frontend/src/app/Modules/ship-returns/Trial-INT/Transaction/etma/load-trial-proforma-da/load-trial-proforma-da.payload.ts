import { FormArray, FormGroup } from '@angular/forms';
import { STEADY_STATE_LOAD_ROWS, TRANSIENT_TEST_LOAD_ROWS } from './load-trial-proforma-da.data';
import {
  ALL_SPEED_TRANSIENT_SUBSECTIONS,
  normalizeGovernorEquipmentType,
  toLegacyGovernorEquipmentType,
  VOLTAGE_TRANSIENT_LOAD_ROWS,
} from './load-trial-proforma-da.extended.data';

type LegacyPayload = Record<string, unknown>;

function val(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  return value;
}

const BREAKER_PROTECTION_SUFFIXES = ['OV', 'UV', 'OVLD'];
const GSP_PROTECTION_SUFFIXES = ['GSP_OV', 'GSP_UVT', 'GSP_RPR', 'GSP_DFT', 'GSP_WTA', 'GSP_BTA'];
const INSTRUMENTATION_KEYS = ['KWM', 'VM', 'AMM', 'FM', 'PFM'];
const DA_PANEL_KEYS = ['DAcpCh_cbl_cond', 'DAcpCh_cleanliness', 'DAcpCh_instrmnttn'];
const MISC_FIELD_MAP = [
  'misc_MSRC',
  'misc_MRRC',
  'misc_ESRC',
  'misc_ERRC',
  'misc_SPM_brng',
  'misc_temp_brng',
  'misc_lbrcnt_used',
  'misc_greasing_instruction',
  'misc_ACH',
  'misc_RRA_replace_date',
  'misc_DTTT_trial_sts',
  'misc_internal_cmmnctn',
  'misc_lghtng_comprt',
  'misc_vntlatn_comprt',
  'misc_generatr_termnal',
  'misc_lose_cables',
  'misc_generatr_Swbd',
  'misc_generatr_supply_brkr',
  'misc_routine_cooler_on',
  'misc_zinc_condn',
];

type SteadyStateLegacyRow = {
  init: string;
  final: string;
  mod: string;
  status: string;
  useDroopField?: boolean;
};

const DA_STEADY_STATE_LEGACY_ROWS: SteadyStateLegacyRow[] = [
  {
    init: 'sst_100_up_init_speed',
    final: 'sst_100_up_final_speed',
    mod: 'sst_100_up_freq_Modln',
    status: 'sst_100_remrak',
  },
  {
    init: 'sst_75_up_init_speed',
    final: 'sst_75_up_final_speed',
    mod: 'sst_75_up_freq_Modln',
    status: 'sst_75_remrak',
  },
  {
    init: 'sst_50_up_init_speed',
    final: 'sst_50_up_final_speed',
    mod: 'sst_50_up_freq_Modln',
    status: 'sst_50_remrak',
  },
  {
    init: 'sst_25_up_init_speed',
    final: 'sst_25_up_final_speed',
    mod: 'sst_25_up_freq_Modln',
    status: 'sst_25_remrak',
  },
  {
    init: 'sst_0_init_speed',
    final: 'sst_0_final_speed',
    mod: 'sst_0_freq_Modln',
    status: 'sst_0_remrak',
  },
  {
    init: 'sst_25_down_init_speed',
    final: 'sst_25_down_final_speed',
    mod: 'sst_25_down_freq_Modln',
    status: 'sst_down_25_remrak',
  },
  {
    init: 'sst_50_down_init_speed',
    final: 'sst_50_down_final_speed',
    mod: 'sst_50_down_freq_Modln',
    status: 'sst_down_50_remrak',
  },
  {
    init: 'sst_75_down_init_speed',
    final: 'sst_75_down_final_speed',
    mod: 'sst_75_down_freq_Modln',
    status: 'sst_down_75_remrak',
  },
  {
    init: 'sst_100_down_init_speed',
    final: 'sst_100_down_final_speed',
    mod: 'sst_100_down_freq_Modln',
    status: 'sst_down_100_remrak',
  },
  {
    init: 'sst_100to0_init_speed',
    final: 'sst_100to0_final_speed',
    mod: 'sst_100to0_governor_droop',
    status: 'sst_100to0_governor_droop_remrak',
    useDroopField: true,
  },
];

function gov2LegacyKey(key: string): string {
  return `${key}_gov_2`;
}

/** Maps reactive-form values to legacy `loadTrialPerformaDA` API keys. */
export function buildLoadTrialProformaDaPayload(
  form: FormGroup,
  parallelingTrial: 'yes' | 'no' | '',
): LegacyPayload {
  const raw = form.getRawValue();
  const payload: LegacyPayload = {
    formGroupKey: 'loadTrialPerformaDA',
    paralleling_trial_enabled: parallelingTrial === 'yes',

    occation_of_trial: val(raw.occasion_of_current_trial),
    trial_date: val(raw.trial_date),
    equipment_KW: val(raw.kw),
    shipID: val(raw.ship),
    da_ta: val(raw.da_ta),
    trial_report_no: val(raw.trial_report_no),

    trial_presented_by_da_load: val(raw.presented_by),
    trials_date: val(raw.trials_date),
    trial_unsertaken_by_da_load: val(raw.trial_undertaken_by),
    occationOfCurrTrial: val(raw.occasion_of_current_trial),
    lastTrialDate: val(raw.date_of_last_trial),
    proposalReference: val(raw.proposal_reference),
    referanceFileID: val(raw.file_reference),
    referanceDocID: val(raw.reference_document_for_trial),
    testEquipmentUsed: val(raw.test_equipment_used),
    testEquipmentRemarks: val(raw.test_equipment_remarks),

    engn_equipmentID: val(raw.engine_make),
    engn_equipmentSrNo: val(raw.engine_model_serial_no),
    engn_rpm_val: val(raw.engine_rpm),
    govnr_equipmentID: val(raw.governor_make),
    govnr_equipmentSrNo: val(raw.governor_model_serial_no),
    govnr_type: toLegacyGovernorEquipmentType(raw.governor_type),
    altnr_equipmentID: val(raw.alternator_make_and_rating),
    altnr_equipmentSrNo: val(raw.alternator_model_serial_no),
    altnr_RatedVoltage: val(raw.alternator_rated_voltage),
    altnr_RatedFrequency: val(raw.alternator_rated_frequency),
    altnr_RatedVal: val(raw.alternator_rated_kva_kw),
    altnr_RatedCurrentVal: val(raw.alternator_rated_current),
    altnr_BearingNo: val(raw.alternator_bearing_number),
    avr_equipmentID: val(raw.avr_make_and_type),
    avr_equipmentSrNo: val(raw.avr_model_serial_no),
    spplyBrkr_equipmentID: val(raw.supply_breaker_make),
    spplyBrkr_equipmentSrNo: val(raw.supply_breaker_model_serial_no),
    spplyBrkr_RatedCpcty: val(raw.supply_breaker_rated_capacity_amps),

    ir_gnrtr_hot: val(raw.insulation_generator_hot),
    ir_gnrtr_cold: val(raw.insulation_generator_cold),
    ir_swtchbrd: val(raw.insulation_switchboard),
    ir_swtchbrd_cbl: val(raw.insulation_generator_to_switchboard_cable),
    ir_insltn_brkr: val(raw.insulation_breaker),
  };

  mapDaProtection(payload, form.get('breaker_protection') as FormArray, BREAKER_PROTECTION_SUFFIXES);
  mapDaProtection(payload, form.get('generator_switchboard_protection') as FormArray, GSP_PROTECTION_SUFFIXES);
  mapDaInstrumentation(payload, form.get('instrumentation') as FormArray);
  mapDaPanel(payload, form.get('da_panel_checks') as FormArray);
  mapDaMiscellaneous(payload, form.get('miscellaneous_checks') as FormArray);
  mapGovernorSteadyState(payload, form, 'governor1', false);
  mapGovernorSteadyState(payload, form, 'governor2', true);
  mapGovernorTransient(payload, form, 'governor1', false);
  mapGovernorTransient(payload, form, 'governor2', true);
  mapGovernorRangeAndRate(payload, form, 'governor1', false);
  mapGovernorRangeAndRate(payload, form, 'governor2', true);
  mapAvrVoltage(payload, form, 'avr1', false);
  mapAvrVoltage(payload, form, 'avr2', true);
  mapSpeedTransientSubsections(payload, form, 'governor1', false);
  mapSpeedTransientSubsections(payload, form, 'governor2', true);
  const parallelingCombinations = Array.isArray(raw.paralleling_combinations)
    ? raw.paralleling_combinations as Record<string, unknown>[]
    : [];
  payload['paralleling_combinations'] = parallelingCombinations;
  payload['dynamic_paralleling_trial_rows'] = parallelingCombinations.map(
    mapParallelingCombinationToLegacy,
  );

  return payload;
}

const PARALLELING_ROW_KEYS = [
  'incrs_20', 'incrs_30', 'incrs_45', 'incrs_60', 'incrs_75',
  'dcrs_75', 'dcrs_60', 'dcrs_45', 'dcrs_30', 'dcrs_20',
];

function mapParallelingCombinationToLegacy(
  combination: Record<string, unknown>,
): Record<string, unknown> {
  const legacy: Record<string, unknown> = {
    paralleling_trial_machine_1: val(combination['machine_1']),
    paralleling_trial_machine_2: val(combination['machine_2']),
    parallel_rated_dg1: val(combination['rated_dg1']),
    parallel_rated_dg2: val(combination['rated_dg2']),
    parallel_amps_dg1: val(combination['amps_dg1']),
    parallel_amps_dg2: val(combination['amps_dg2']),
  };

  (['kw', 'kvar'] as const).forEach((kind) => {
    const rows = Array.isArray(combination[`${kind}_rows`])
      ? combination[`${kind}_rows`] as Record<string, unknown>[]
      : [];
    rows.forEach((row, index) => {
      const rowKey = PARALLELING_ROW_KEYS[index];
      if (!rowKey) return;
      const base = `unttnddprllng_${rowKey}`;
      const unit = kind === 'kw' ? 'KW' : 'KVA';
      legacy[`${base}_${unit}_combined_val`] = val(row['combined_load']);
      legacy[`${base}_${unit}_proportionate`] = val(row['proportionate_a']);
      legacy[`${base}_${unit}_proportionate1`] = val(row['proportionate_b']);
      legacy[`${base}_${unit}_machineA`] = val(row['actual_a']);
      legacy[`${base}_${unit}_machineB`] = val(row['actual_b']);
      legacy[`${base}_${unit}_differences`] = val(row['difference']);
      legacy[`${base}_${unit}_ratings`] = val(combination[`${kind}_tolerance`]);
      legacy[kind === 'kw' ? `${base}_remarks` : `${base}_KVA_remarks`] = val(row['status']);
    });
  });
  return legacy;
}

function mapDaProtection(payload: LegacyPayload, rows: FormArray, suffixes: string[]): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const sfx = suffixes[index];
    if (!sfx) return;
    payload[`proChck_${sfx}_CDate`] = val(v.calibration_date);
    payload[`proChck_${sfx}_CertSts`] = val(v.calibration_cert_provided);
    payload[`proChck_${sfx}_ObsVal`] = val(v.observed_value);
    payload[`proChck_${sfx}_Sts`] = val(v.status);
    payload[`proChck_${sfx}_Remarks`] = val(v.remarks);
    payload[`proChck_${sfx}_UploadFile`] = val(v.upload_file);
  });
}

function mapDaInstrumentation(payload: LegacyPayload, rows: FormArray): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = INSTRUMENTATION_KEYS[index];
    if (!key) return;
    payload[`instrmtn_${key}_ops`] = val(v.ops_non_ops);
    payload[`instrmtn_${key}_CDate`] = val(v.calibration_date);
    payload[`instrmtn_${key}_CertSts`] = val(v.calibration_cert_provided);
    payload[`instrmtn_${key}_Sts`] = val(v.status);
    payload[`instrmtn_${key}_Remarks`] = val(v.remarks);
    payload[`instrmtn_${key}_UploadFile`] = val(v.upload_file);
  });
}

function mapDaPanel(payload: LegacyPayload, rows: FormArray): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = DA_PANEL_KEYS[index];
    if (!key) return;
    payload[key] = val(v.status ?? v.details);
    payload[`${key}_remarks`] = val(v.remarks);
  });
}

function mapDaMiscellaneous(payload: LegacyPayload, rows: FormArray): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = MISC_FIELD_MAP[index];
    if (!key) return;
    payload[key] = val(v.details);
    payload[`${key}_remarks`] = val(v.remarks);
    payload[`${key}_upload_file`] = val(v.upload_file);
  });
}

function mapGovernorSteadyState(
  payload: LegacyPayload,
  form: FormGroup,
  governor: 'governor1' | 'governor2',
  isGov2: boolean,
): void {
  const rows = form.get(`${governor}_steady_state`) as FormArray;
  const nominal = form.get(`${governor}_nominal_frequency`)?.value;
  const nominalKey = isGov2 ? 'steadyStateNominalFriq_gov2' : 'steadyStateNominalFriq';
  payload[nominalKey] = val(nominal);
  if (!isGov2) {
    payload['transientTableNominalFriq'] = val(nominal);
  }

  rows?.controls.forEach((row, index) => {
    const legacyRow = DA_STEADY_STATE_LEGACY_ROWS[index];
    const rowMeta = STEADY_STATE_LOAD_ROWS[index];
    if (!legacyRow || !rowMeta) return;

    const v = (row as FormGroup).getRawValue();
    const initKey = isGov2 ? gov2LegacyKey(legacyRow.init) : legacyRow.init;
    const finalKey = isGov2 ? gov2LegacyKey(legacyRow.final) : legacyRow.final;
    const modKey = isGov2 ? gov2LegacyKey(legacyRow.mod) : legacyRow.mod;
    const statusKey = isGov2 ? gov2LegacyKey(legacyRow.status) : legacyRow.status;

    payload[initKey] = val(v.initial_speed_hz);
    payload[finalKey] = val(v.final_speed_hz);
    payload[modKey] = val(legacyRow.useDroopField ? v.governor_droop : v.frequency_modulation);
    payload[statusKey] = val(v.status);
  });
}

function mapGovernorTransient(
  payload: LegacyPayload,
  form: FormGroup,
  governor: 'governor1' | 'governor2',
  isGov2: boolean,
): void {
  const rows = form.get(`${governor}_transient`) as FormArray;
  const peakLimit = form.get(`${governor}_peak_permissible_limit`)?.value;
  const peakKey = isGov2 ? 'peak_permissible_limit_gov_2' : 'peak_permissible_limit';
  payload[peakKey] = val(peakLimit);
  if (!isGov2) {
    payload['trnsntTstAlt_0x25_peak_limit'] = val(peakLimit);
  }

  rows?.controls.forEach((row, index) => {
    const meta = TRANSIENT_TEST_LOAD_ROWS[index];
    if (!meta) return;
    const v = (row as FormGroup).getRawValue();
    const key = `${meta.loadInitial}x${meta.loadTo}`;
    const prefix = isGov2 ? `trnsntTst_${key}_gov_2` : `trnsntTst_${key}`;
    payload[`${prefix}_init_speed`] = val(v.initial_speed_hz);
    payload[`${prefix}_mtry_speed`] = val(v.momentary_speed_hz);
    payload[`${prefix}_final_speed`] = val(v.final_speed_hz);
    payload[`${prefix}_peak_obs`] = val(v.peak_observed);
    payload[`${prefix}_recov_Obs`] = val(v.recovery_observed);
    payload[`${prefix}_final_value`] = val(v.recovery_final_value);
    payload[`${prefix}_remark`] = val(v.status);

    if (!isGov2) {
      const altPrefix = `trnsntTstAlt_${key}`;
      payload[`${altPrefix}_init_speed`] = val(v.initial_speed_hz);
      payload[`${altPrefix}_mtry_speed`] = val(v.momentary_speed_hz);
      payload[`${altPrefix}_final_speed`] = val(v.final_speed_hz);
      payload[`${altPrefix}_peak_obs`] = val(v.peak_observed);
      payload[`${altPrefix}_final_val_obs`] = val(v.recovery_observed);
      payload[`${altPrefix}_final_val_obs_2`] = val(v.recovery_final_value);
      payload[`${altPrefix}_remarks`] = val(v.status);
      if (key === '50x75') {
        payload['test8_init_speed'] = val(v.initial_speed_hz);
        payload['test8_mtry_speed'] = val(v.momentary_speed_hz);
        payload['test8_final_speed'] = val(v.final_speed_hz);
        payload['test8_peak_obs'] = val(v.peak_observed);
        payload['test8_final_val_obs'] = val(v.recovery_observed);
        payload['test8_final_val_obs_2'] = val(v.recovery_final_value);
        payload['test8_remarks'] = val(v.status);
      }
    }
  });
}

function mapGovernorRangeAndRate(
  payload: LegacyPayload,
  form: FormGroup,
  governor: 'governor1' | 'governor2',
  isGov2: boolean,
): void {
  const rangeRows = form.get(`${governor}_governor_range`) as FormArray;
  const rateRows = form.get(`${governor}_governor_rate`) as FormArray;
  const loads = ['0', '100'];

  rangeRows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    const prefix = isGov2 ? `govrnr_range_${load}_gov_2` : `govrnr_range_${load}`;
    payload[`${prefix}_measured`] = val(v.measured_frequency_hz);
    payload[`${prefix}_remark`] = val(v.status);
  });

  rateRows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    const prefix = isGov2 ? `govrnr_motor_${load}_gov_2` : `govrnr_motor_${load}`;
    payload[`${prefix}_up`] = val(v.rate_up);
    payload[`${prefix}_down`] = val(v.rate_down);
    payload[`${prefix}_remark`] = val(v.status);
  });
}

function mapAvrVoltage(
  payload: LegacyPayload,
  form: FormGroup,
  avr: 'avr1' | 'avr2',
  isAvr2: boolean,
): void {
  const suffix = isAvr2 ? '_avr_2' : '';
  payload[`steadyStateNominalVoltage${suffix}`] = val(form.get(`${avr}_nominal_voltage`)?.value);
  payload[`voltage_permissible_limit${suffix}`] = val(
    form.get(`${avr}_voltage_permissible_limit`)?.value,
  );
  payload[`voltwavHorCont_max${suffix}`] = val(form.get(`${avr}_harmonic_content`)?.value);
  payload[`voltRange_permissible_limit${suffix}`] = val(
    form.get(`${avr}_voltage_range_permissible_limit`)?.value,
  );

  const steadyLoads = ['100', '75', '50', '25', '0'];
  const steadyRows = form.get(`${avr}_voltage_steady_state`) as FormArray;
  steadyRows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = steadyLoads[index];
    if (!load) return;
    payload[`sstv${load}Val${suffix}`] = val(v.kw);
    payload[`sstv${load}ObsVolt${suffix}`] = val(v.volts_max);
    payload[`sstv${load}ObsVoltMin${suffix}`] = val(v.volts_min);
    payload[`sstv${load}PF${suffix}`] = val(v.power_factor);
    payload[`sstv${load}RatedAmp${suffix}`] = val(v.rated_amps);
    payload[`sstv${load}ObsAmp${suffix}`] = val(v.observed_amps);
    payload[`sstv${load}VoltModln${suffix}`] = val(v.voltage_modulation);
    payload[`sstv_remark${index + 1}${suffix}`] = val(v.status);
  });

  const transientRows = form.get(`${avr}_voltage_transient`) as FormArray;
  transientRows?.controls.forEach((row, index) => {
    const meta = VOLTAGE_TRANSIENT_LOAD_ROWS[index];
    if (!meta) return;
    const v = (row as FormGroup).getRawValue();
    const key = meta.loadTo
      ? `${meta.loadInitial}x${meta.loadTo}`.replace('+', 'M')
      : `${meta.loadInitial}M`;
    const prefix = `vtrt${key}${suffix}`;
    payload[`${prefix}_init_volt`] = val(v.initial_voltage);
    payload[`${prefix}_memtry_volt`] = val(v.momentary_voltage);
    payload[`${prefix}_final_volt`] = val(v.final_voltage);
    payload[`${prefix}_peak_obs`] = val(v.peak_observed);
    payload[`${prefix}_final_value`] = val(v.final_value);
    payload[`${prefix}_recov_Obs`] = val(v.recovery_observed);
    payload[`${prefix}_remark`] = val(v.status);
  });

  const balanceLoads = ['0', '100'];
  const balanceRows = form.get(`${avr}_voltage_balance`) as FormArray;
  balanceRows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = balanceLoads[index];
    if (!load) return;
    payload[`voltBalTst_${load}_RY${suffix}`] = val(v.line_voltage_ry);
    payload[`voltBalTst_${load}_YB${suffix}`] = val(v.line_voltage_yb);
    payload[`voltBalTst_${load}_BR${suffix}`] = val(v.line_voltage_br);
    payload[`voltBalTst_${load}_diff${suffix}`] = val(v.difference);
    payload[`voltBalTst_${load}_pLimit${suffix}`] = val(v.permissible_limit);
    payload[`voltBalTst_${load}v_remarks${suffix}`] = val(v.status);
  });

  mapVoltageRange(payload, form.get(`${avr}_voltage_range_avr`) as FormArray, `voltRangeAVR${suffix}`);
  mapVoltageRange(payload, form.get(`${avr}_voltage_range_hand`) as FormArray, `voltRangeHC${suffix}`);
}

function mapVoltageRange(payload: LegacyPayload, rows: FormArray, prefix: string): void {
  const loads = ['0', '100'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`${prefix}_${load}_swtchbrd_lowest_limit`] = val(v.voltage_lowest);
    payload[`${prefix}_${load}_swtchbrd_highest_limit`] = val(v.voltage_highest);
    payload[`${prefix}_${load}_status`] = val(v.status);
  });
}

function mapSpeedTransientSubsections(
  payload: LegacyPayload,
  form: FormGroup,
  governor: 'governor1' | 'governor2',
  isGov2: boolean,
): void {
  for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
    const rows = form.get(`${governor}_${subsection.key}_transient`) as FormArray;
    if (subsection.peakLimitInput) {
      const peakKey = isGov2
        ? `${governor}_${subsection.key}_peak_limit_gov_2`
        : `${governor}_${subsection.key}_peak_limit`;
      payload[peakKey] = val(form.get(`${governor}_${subsection.key}_peak_limit`)?.value);
    }

    rows?.controls.forEach((row, rowIndex) => {
      const rowMeta = subsection.rows[rowIndex];
      if (!rowMeta) return;
      const v = (row as FormGroup).getRawValue();
      const key = `${subsection.key}_${rowMeta.loadInitial}x${rowMeta.loadTo}`;
      const prefix = isGov2 ? `${key}_gov_2` : key;
      payload[`${prefix}_init_speed`] = val(v.initial_speed_hz);
      payload[`${prefix}_mtry_speed`] = val(v.momentary_speed_hz);
      payload[`${prefix}_final_speed`] = val(v.final_speed_hz);
      payload[`${prefix}_peak_obs`] = val(v.peak_observed);
      payload[`${prefix}_recov_Obs`] = val(v.recovery_observed);
      payload[`${prefix}_final_value`] = val(v.recovery_final_value);
      payload[`${prefix}_remark`] = val(v.status);
    });
  }
}

function unwrapDaPayload(payload: unknown): LegacyPayload {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as LegacyPayload;

  if (record['formGroupKey'] === 'loadTrialPerformaDA') {
    return record;
  }

  if (
    record['loadTrialPerformaDA'] &&
    typeof record['loadTrialPerformaDA'] === 'object'
  ) {
    return record['loadTrialPerformaDA'] as LegacyPayload;
  }

  if (record['data'] && typeof record['data'] === 'object') {
    const fromData = unwrapDaPayload(record['data']);
    if (fromData['formGroupKey'] === 'loadTrialPerformaDA') return fromData;
  }

  if (record['json_data'] && typeof record['json_data'] === 'object') {
    const fromJsonData = unwrapDaPayload(record['json_data']);
    if (fromJsonData['formGroupKey'] === 'loadTrialPerformaDA') return fromJsonData;
  }

  // For API shape like: json_data: { Electronic: { formGroupKey: 'loadTrialPerformaDA', ... } }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const nested = value as LegacyPayload;

      if (nested['formGroupKey'] === 'loadTrialPerformaDA') {
        return nested;
      }

      if (
        nested['loadTrialPerformaDA'] &&
        typeof nested['loadTrialPerformaDA'] === 'object'
      ) {
        return nested['loadTrialPerformaDA'] as LegacyPayload;
      }
    }
  }

  return record;
}

function pick<T>(payload: LegacyPayload, key: string): T | undefined {
  const value = payload[key];
  if (value === null || value === undefined || value === '') return undefined;
  return value as T;
}

export type DaFormFillResult = {
  formPatch: Record<string, unknown>;
  parallelingTrial: 'yes' | 'no' | '';
  parallelingCombinations: Record<string, any>[];
};

export function legacyPayloadToDaFormFill(payload: unknown): DaFormFillResult {
  const legacy = unwrapDaPayload(payload);
  const formPatch: Record<string, unknown> = {
    trials_date: pick(legacy, 'trials_date'),
    da_ta: pick(legacy, 'da_ta'),
    trial_report_no: pick(legacy, 'trial_report_no'),
    kw: pick(legacy, 'equipment_KW'),
    ship: pick(legacy, 'shipID'),
    presented_by: pick(legacy, 'trial_presented_by_da_load') ?? pick(legacy, 'Presented_by'),
    trial_date: pick(legacy, 'trial_date'),
    trial_undertaken_by:
      pick(legacy, 'trial_unsertaken_by_da_load') ?? pick(legacy, 'trials_undertaken_by'),
    occasion_of_current_trial: pick(legacy, 'occationOfCurrTrial') ?? pick(legacy, 'occation_of_trial'),
    date_of_last_trial: pick(legacy, 'lastTrialDate'),
    proposal_reference:
      pick(legacy, 'proposalReference') ??
      pick(legacy, 'proposal_reference') ??
      pick(legacy, 'referanceProposalID'),
    file_reference: pick(legacy, 'referanceFileID'),
    reference_document_for_trial:
      pick(legacy, 'referanceDocID') ?? 'Def Stan 08-142, EED-Q-242(R2) and BR 6500',
    test_equipment_used: pick(legacy, 'testEquipmentUsed'),
    test_equipment_remarks: pick(legacy, 'testEquipmentRemarks'),
    engine_make: pick(legacy, 'engn_equipmentID'),
    engine_model_serial_no: pick(legacy, 'engn_equipmentSrNo'),
    engine_rpm: pick(legacy, 'engn_rpm_val'),
    governor_make: pick(legacy, 'govnr_equipmentID'),
    governor_model_serial_no: pick(legacy, 'govnr_equipmentSrNo'),
    governor_type: normalizeGovernorEquipmentType(pick(legacy, 'govnr_type')),
    alternator_make_and_rating: pick(legacy, 'altnr_equipmentID'),
    alternator_model_serial_no: pick(legacy, 'altnr_equipmentSrNo'),
    alternator_rated_voltage: pick(legacy, 'altnr_RatedVoltage'),
    alternator_rated_frequency: pick(legacy, 'altnr_RatedFrequency'),
    alternator_rated_kva_kw: pick(legacy, 'altnr_RatedVal'),
    alternator_rated_current: pick(legacy, 'altnr_RatedCurrentVal'),
    alternator_bearing_number: pick(legacy, 'altnr_BearingNo'),
    avr_make_and_type: pick(legacy, 'avr_equipmentID'),
    avr_model_serial_no: pick(legacy, 'avr_equipmentSrNo'),
    supply_breaker_make: pick(legacy, 'spplyBrkr_equipmentID'),
    supply_breaker_model_serial_no: pick(legacy, 'spplyBrkr_equipmentSrNo'),
    supply_breaker_rated_capacity_amps: pick(legacy, 'spplyBrkr_RatedCpcty'),
    insulation_generator_hot: pick(legacy, 'ir_gnrtr_hot'),
    insulation_generator_cold: pick(legacy, 'ir_gnrtr_cold'),
    insulation_switchboard: pick(legacy, 'ir_swtchbrd'),
    insulation_generator_to_switchboard_cable:
      pick(legacy, 'ir_swtchbrd_cbl') ?? pick(legacy, 'ir_gnrtr_cbl'),
    insulation_breaker: pick(legacy, 'ir_insltn_brkr'),
    governor1_nominal_frequency:
      pick(legacy, 'steadyStateNominalFriq') ?? pick(legacy, 'transientTableNominalFriq'),
    governor2_nominal_frequency: pick(legacy, 'steadyStateNominalFriq_gov2'),
    governor1_peak_permissible_limit:
      pick(legacy, 'trnsntTstAlt_0x25_peak_limit') ?? pick(legacy, 'peak_permissible_limit'),
    governor2_peak_permissible_limit: pick(legacy, 'peak_permissible_limit_gov_2'),
    avr1_nominal_voltage: pick(legacy, 'steadyStateNominalVoltage'),
    avr2_nominal_voltage: pick(legacy, 'steadyStateNominalVoltage_avr_2'),
    avr1_voltage_permissible_limit: pick(legacy, 'voltage_permissible_limit'),
    avr2_voltage_permissible_limit: pick(legacy, 'voltage_permissible_limit_avr_2'),
    avr1_harmonic_content: pick(legacy, 'voltwavHorCont_max'),
    avr2_harmonic_content: pick(legacy, 'voltwavHorCont_max_avr_2'),
    avr1_voltage_range_permissible_limit: pick(legacy, 'voltRange_permissible_limit'),
    avr2_voltage_range_permissible_limit: pick(legacy, 'voltRange_permissible_limit_avr_2'),
  };

  fillDaProtectionRows(formPatch, legacy, 'breaker_protection', BREAKER_PROTECTION_SUFFIXES);
  fillDaProtectionRows(formPatch, legacy, 'generator_switchboard_protection', GSP_PROTECTION_SUFFIXES);
  fillDaInstrumentationRows(formPatch, legacy);
  fillDaPanelRows(formPatch, legacy);
  fillDaMiscellaneousRows(formPatch, legacy);
  fillGovernorSteadyStateRows(formPatch, legacy, 'governor1_steady_state', false);
  fillGovernorSteadyStateRows(formPatch, legacy, 'governor2_steady_state', true);
  fillGovernorTransientRows(formPatch, legacy, 'governor1_transient', false);
  fillGovernorTransientRows(formPatch, legacy, 'governor2_transient', true);

  fillGovernorRangeRows(formPatch, legacy, 'governor1_governor_range', false);
  fillGovernorRangeRows(formPatch, legacy, 'governor2_governor_range', true);

  fillGovernorRateRows(formPatch, legacy, 'governor1_governor_rate', false);
  fillGovernorRateRows(formPatch, legacy, 'governor2_governor_rate', true);

  fillAvrVoltageRows(formPatch, legacy, 'avr1', false);
  fillAvrVoltageRows(formPatch, legacy, 'avr2', true);

  fillSpeedTransientSubsectionRows(formPatch, legacy, 'governor1', false);
  fillSpeedTransientSubsectionRows(formPatch, legacy, 'governor2', true);

  const parallelingCombinations = readParallelingCombinations(legacy);
  const parallelingTrial: 'yes' | 'no' | '' = legacy['paralleling_trial_enabled'] === true || parallelingCombinations.length > 0
    ? 'yes'
    : legacy['paralleling_trial_enabled'] === false
      ? 'no'
      : '';

  return { formPatch, parallelingTrial, parallelingCombinations };
}

function readParallelingCombinations(legacy: LegacyPayload): Record<string, any>[] {
  const modern = legacy['paralleling_combinations'];
  if (Array.isArray(modern)) {
    return modern.filter((row): row is Record<string, any> => !!row && typeof row === 'object');
  }

  const legacyRows = legacy['dynamic_paralleling_trial_rows'];
  if (!Array.isArray(legacyRows)) return [];
  return legacyRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map(mapLegacyParallelingCombination);
}

function mapLegacyParallelingCombination(row: Record<string, unknown>): Record<string, any> {
  const combination: Record<string, any> = {
    machine_1: row['paralleling_trial_machine_1'] ?? '',
    machine_2: row['paralleling_trial_machine_2'] ?? '',
    rated_dg1: row['parallel_rated_dg1'] ?? '',
    rated_dg2: row['parallel_rated_dg2'] ?? '',
    amps_dg1: row['parallel_amps_dg1'] ?? '',
    amps_dg2: row['parallel_amps_dg2'] ?? '',
    kw_tolerance: '',
    kvar_tolerance: '',
  };

  (['kw', 'kvar'] as const).forEach((kind) => {
    const unit = kind === 'kw' ? 'KW' : 'KVA';
    combination[`${kind}_rows`] = PARALLELING_ROW_KEYS.map((rowKey) => {
      const base = `unttnddprllng_${rowKey}`;
      const tolerance = row[`${base}_${unit}_ratings`];
      if (combination[`${kind}_tolerance`] === '' && tolerance !== undefined && tolerance !== null) {
        combination[`${kind}_tolerance`] = tolerance;
      }
      return {
        combined_load: row[`${base}_${unit}_combined_val`] ?? '',
        proportionate_a: row[`${base}_${unit}_proportionate`] ?? '',
        proportionate_b: row[`${base}_${unit}_proportionate1`] ?? '',
        actual_a: row[`${base}_${unit}_machineA`] ?? '',
        actual_b: row[`${base}_${unit}_machineB`] ?? '',
        difference: row[`${base}_${unit}_differences`] ?? '',
        status: row[kind === 'kw' ? `${base}_remarks` : `${base}_KVA_remarks`] ?? '',
      };
    });
  });
  return combination;
}

function fillDaProtectionRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  suffixes: string[],
): void {
  formPatch[arrayKey] = suffixes.map((sfx) => ({
    calibration_date: pick(legacy, `proChck_${sfx}_CDate`),
    calibration_cert_provided: pick(legacy, `proChck_${sfx}_CertSts`),
    observed_value: pick(legacy, `proChck_${sfx}_ObsVal`),
    status: pick(legacy, `proChck_${sfx}_Sts`),
    remarks: pick(legacy, `proChck_${sfx}_Remarks`),
    upload_file:
      pick(legacy, `proChck_${sfx}_UploadFile`) ??
      pick(legacy, `proChck_${sfx}_upload_file`),
  }));
}

function fillDaInstrumentationRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  formPatch['instrumentation'] = INSTRUMENTATION_KEYS.map((key) => ({
    ops_non_ops: pick(legacy, `instrmtn_${key}_ops`),
    calibration_date: pick(legacy, `instrmtn_${key}_CDate`),
    calibration_cert_provided: pick(legacy, `instrmtn_${key}_CertSts`),
    status: pick(legacy, `instrmtn_${key}_Sts`),
    remarks: pick(legacy, `instrmtn_${key}_Remarks`),
    upload_file:
      pick(legacy, `instrmtn_${key}_UploadFile`) ??
      pick(legacy, `instrmtn_${key}_upload_file`),
  }));
}

function fillDaPanelRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  formPatch['da_panel_checks'] = DA_PANEL_KEYS.map((key, index) =>
    index === 2
      ? { details: pick(legacy, key), remarks: pick(legacy, `${key}_remarks`) }
      : { status: pick(legacy, key), remarks: pick(legacy, `${key}_remarks`) },
  );
}

function fillDaMiscellaneousRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  formPatch['miscellaneous_checks'] = MISC_FIELD_MAP.map((key) => ({
    details: pick(legacy, key),
    remarks: pick(legacy, `${key}_remarks`),
    upload_file:
      pick(legacy, `${key}_upload_file`) ??
      pick(legacy, `${key}_UploadFile`),
  }));
}

function fillGovernorSteadyStateRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  isGov2: boolean,
): void {
  formPatch[arrayKey] = DA_STEADY_STATE_LEGACY_ROWS.map((legacyRow) => {
    const initKey = isGov2 ? gov2LegacyKey(legacyRow.init) : legacyRow.init;
    const finalKey = isGov2 ? gov2LegacyKey(legacyRow.final) : legacyRow.final;
    const modKey = isGov2 ? gov2LegacyKey(legacyRow.mod) : legacyRow.mod;
    const statusKey = isGov2 ? gov2LegacyKey(legacyRow.status) : legacyRow.status;
    return {
      initial_speed_hz: pick(legacy, initKey),
      final_speed_hz: pick(legacy, finalKey),
      governor_droop: legacyRow.useDroopField ? pick(legacy, modKey) : undefined,
      frequency_modulation: legacyRow.useDroopField ? undefined : pick(legacy, modKey),
      status: pick(legacy, statusKey),
    };
  });
}

function fillGovernorTransientRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  isGov2: boolean,
): void {
  formPatch[arrayKey] = TRANSIENT_TEST_LOAD_ROWS.map((meta) => {
    const key = `${meta.loadInitial}x${meta.loadTo}`;
    const prefix = isGov2 ? `trnsntTst_${key}_gov_2` : `trnsntTst_${key}`;
    if (isGov2) {
      return {
        initial_speed_hz: pick(legacy, `${prefix}_init_speed`),
        momentary_speed_hz: pick(legacy, `${prefix}_mtry_speed`),
        final_speed_hz: pick(legacy, `${prefix}_final_speed`),
        peak_observed: pick(legacy, `${prefix}_peak_obs`),
        recovery_observed: pick(legacy, `${prefix}_recov_Obs`),
        recovery_final_value: pick(legacy, `${prefix}_final_value`),
        status: pick(legacy, `${prefix}_remark`),
      };
    }

    const altPrefix = `trnsntTstAlt_${key}`;
    const test8 = key === '50x75';
    return {
      initial_speed_hz:
        pick(legacy, `${altPrefix}_init_speed`) ??
        (test8 ? pick(legacy, 'test8_init_speed') : undefined) ??
        pick(legacy, `${prefix}_init_speed`),
      momentary_speed_hz:
        pick(legacy, `${altPrefix}_mtry_speed`) ??
        (test8 ? pick(legacy, 'test8_mtry_speed') : undefined) ??
        pick(legacy, `${prefix}_mtry_speed`),
      final_speed_hz:
        pick(legacy, `${altPrefix}_final_speed`) ??
        (test8 ? pick(legacy, 'test8_final_speed') : undefined) ??
        pick(legacy, `${prefix}_final_speed`),
      peak_observed:
        pick(legacy, `${altPrefix}_peak_obs`) ??
        (test8 ? pick(legacy, 'test8_peak_obs') : undefined) ??
        pick(legacy, `${prefix}_peak_obs`),
      recovery_observed:
        pick(legacy, `${altPrefix}_final_val_obs`) ??
        (test8 ? pick(legacy, 'test8_final_val_obs') : undefined) ??
        pick(legacy, `${prefix}_recov_Obs`),
      recovery_final_value:
        pick(legacy, `${altPrefix}_final_val_obs_2`) ??
        (test8 ? pick(legacy, 'test8_final_val_obs_2') : undefined) ??
        pick(legacy, `${prefix}_final_value`),
      status:
        pick(legacy, `${altPrefix}_remarks`) ??
        (test8 ? pick(legacy, 'test8_remarks') : undefined) ??
        pick(legacy, `${prefix}_remark`),
    };
  });
}

function fillGovernorRangeRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  isGov2: boolean,
): void {
  const loads = ['0', '100'];

  formPatch[arrayKey] = loads.map((load) => {
    const prefix = isGov2 ? `govrnr_range_${load}_gov_2` : `govrnr_range_${load}`;

    return {
      measured_frequency_hz: pick(legacy, `${prefix}_measured`),
      status: pick(legacy, `${prefix}_remark`),
    };
  });
}

function fillGovernorRateRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  isGov2: boolean,
): void {
  const loads = ['0', '100'];

  formPatch[arrayKey] = loads.map((load) => {
    const prefix = isGov2 ? `govrnr_motor_${load}_gov_2` : `govrnr_motor_${load}`;

    return {
      rate_up: pick(legacy, `${prefix}_up`),
      rate_down: pick(legacy, `${prefix}_down`),
      status: pick(legacy, `${prefix}_remark`),
    };
  });
}

function voltageTransientLegacyKey(loadInitial: string, loadTo: string): string {
  return loadTo
    ? `${loadInitial}x${loadTo}`.replace('+', 'M')
    : `${loadInitial}M`;
}

function fillAvrVoltageRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  avr: 'avr1' | 'avr2',
  isAvr2: boolean,
): void {
  const suffix = isAvr2 ? '_avr_2' : '';

  const steadyLoads = ['100', '75', '50', '25', '0'];

  formPatch[`${avr}_voltage_steady_state`] = steadyLoads.map((load, index) => ({
    kw: pick(legacy, `sstv${load}Val${suffix}`),
    volts_max: pick(legacy, `sstv${load}ObsVolt${suffix}`),
    volts_min: pick(legacy, `sstv${load}ObsVoltMin${suffix}`),
    power_factor: pick(legacy, `sstv${load}PF${suffix}`),
    rated_amps: pick(legacy, `sstv${load}RatedAmp${suffix}`),
    observed_amps: pick(legacy, `sstv${load}ObsAmp${suffix}`),
    voltage_modulation: pick(legacy, `sstv${load}VoltModln${suffix}`),
    status: pick(legacy, `sstv_remark${index + 1}${suffix}`),
  }));

  formPatch[`${avr}_voltage_transient`] = VOLTAGE_TRANSIENT_LOAD_ROWS.map((meta) => {
    const key = voltageTransientLegacyKey(meta.loadInitial, meta.loadTo);
    const prefix = `vtrt${key}${suffix}`;

    return {
      initial_voltage: pick(legacy, `${prefix}_init_volt`),
      momentary_voltage: pick(legacy, `${prefix}_memtry_volt`),
      final_voltage: pick(legacy, `${prefix}_final_volt`),
      peak_observed: pick(legacy, `${prefix}_peak_obs`),
      final_value: pick(legacy, `${prefix}_final_value`),
      recovery_observed: pick(legacy, `${prefix}_recov_Obs`),
      status: pick(legacy, `${prefix}_remark`),
    };
  });

  const balanceLoads = ['0', '100'];

  formPatch[`${avr}_voltage_balance`] = balanceLoads.map((load) => ({
    line_voltage_ry: pick(legacy, `voltBalTst_${load}_RY${suffix}`),
    line_voltage_yb: pick(legacy, `voltBalTst_${load}_YB${suffix}`),
    line_voltage_br: pick(legacy, `voltBalTst_${load}_BR${suffix}`),
    difference: pick(legacy, `voltBalTst_${load}_diff${suffix}`),
    permissible_limit: pick(legacy, `voltBalTst_${load}_pLimit${suffix}`),
    status: pick(legacy, `voltBalTst_${load}v_remarks${suffix}`),
  }));

  fillVoltageRangeRows(formPatch, legacy, `${avr}_voltage_range_avr`, `voltRangeAVR${suffix}`);
  fillVoltageRangeRows(formPatch, legacy, `${avr}_voltage_range_hand`, `voltRangeHC${suffix}`);
}

function fillVoltageRangeRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  prefix: string,
): void {
  const loads = ['0', '100'];

  formPatch[arrayKey] = loads.map((load) => ({
    voltage_lowest: pick(legacy, `${prefix}_${load}_swtchbrd_lowest_limit`),
    voltage_highest: pick(legacy, `${prefix}_${load}_swtchbrd_highest_limit`),
    status: pick(legacy, `${prefix}_${load}_status`),
  }));
}

function fillSpeedTransientSubsectionRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  governor: 'governor1' | 'governor2',
  isGov2: boolean,
): void {
  for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
    const arrayKey = `${governor}_${subsection.key}_transient`;

    if (subsection.peakLimitInput) {
      const peakKey = isGov2
        ? `${governor}_${subsection.key}_peak_limit_gov_2`
        : `${governor}_${subsection.key}_peak_limit`;

      formPatch[`${governor}_${subsection.key}_peak_limit`] = pick(legacy, peakKey);
    }

    formPatch[arrayKey] = subsection.rows.map((rowMeta) => {
      const key = `${subsection.key}_${rowMeta.loadInitial}x${rowMeta.loadTo}`;
      const prefix = isGov2 ? `${key}_gov_2` : key;

      return {
        initial_speed_hz: pick(legacy, `${prefix}_init_speed`),
        momentary_speed_hz: pick(legacy, `${prefix}_mtry_speed`),
        final_speed_hz: pick(legacy, `${prefix}_final_speed`),
        peak_observed: pick(legacy, `${prefix}_peak_obs`),
        recovery_observed: pick(legacy, `${prefix}_recov_Obs`),
        recovery_final_value: pick(legacy, `${prefix}_final_value`),
        status: pick(legacy, `${prefix}_remark`),
      };
    });
  }
}
