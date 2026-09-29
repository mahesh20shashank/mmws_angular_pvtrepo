import { FormArray, FormGroup } from '@angular/forms';
import {
  GTG_PHM_TRANSIENT_OFF_ROWS,
  GTG_PHM_TRANSIENT_ON_ROWS,
  GTG_STEADY_STATE_OFF_ROWS,
  GTG_VOLTAGE_TRANSIENT_ROWS,
} from './load-trial-proforma-gtg.data';
import {
  PARALLELING_SHARING_ROWS,
  parallelingLegacyFieldPrefix,
} from './load-trial-proforma-gtg.paralleling.data';

type LegacyPayload = Record<string, unknown>;

function val(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  return value;
}

/** Maps reactive-form values to legacy `loadTrialPerformaGTG` API keys. */
export function buildLoadTrialProformaGtgPayload(
  form: FormGroup,
  parallelingTrial: 'yes' | 'no' | '',
): LegacyPayload {
  const raw = form.getRawValue();
  const payload: LegacyPayload = {
    formGroupKey: 'loadTrialPerformaGTG',
    paralleling_trial_enabled: parallelingTrial === 'yes',

    occation_of_trial: val(raw.occasion_of_current_trial),
    trial_date: val(raw.trial_date),
    trial_report_no: val(raw.trial_report_no),
    gtg: val(raw.gtg),
    equipment_KW: val(raw.kw),
    shipID: val(raw.ship),

    Presented_by: val(raw.presented_by),
    trials_date: val(raw.trials_date),
    trials_undertaken_by: val(raw.trial_undertaken_by),
    occationOfCurrTrial: val(raw.occasion_of_current_trial),
    lastTrialDate: val(raw.date_of_last_trial),
    // referanceFileID: val(raw.file_reference),
    referanceFileID: val(raw.proposal_reference),
    referanceFileText: val(raw.file_reference),
    referanceDocID: val(raw.reference_document_for_trial),
    testEquipmentUsed: val(raw.test_equipment_used),

    engn_equipmentID: val(raw.engine_make),
    engn_equipmentSrNo: val(raw.engine_model_serial_no),
    engn_rpm_val: val(raw.engine_rpm),
    govnr_equipmentID: val(raw.governor_make),
    govnr_equipmentSrNo: val(raw.governor_model_serial_no),
    govnr_type: val(raw.governor_type),
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
    ir_gnrtr_cbl: val(raw.insulation_generator_to_switchboard_cable),
    ir_insltn_brkr: val(raw.insulation_breaker),

    steadyStateNominalFriq: val(raw.nominal_frequency),
    steadyStateVoltageFriq: val(raw.nominal_voltage),
    vtrt_m_load: val(raw.m_load_amps),
    voltwavHorCont_max: val(raw.harmonic_content),
    voltRangeAVR_0_Remarks: val(raw.voltage_range_permissible_limit),

    Gen_r_ship_Engineer_Officer: val(raw.gen_r_ship_engineer_officer),
    trial_Officer: val(raw.trial_officer),
    recommendations: val(raw.recommendations),
    final_status: val(raw.final_status),
  };
console.log('raw form value:', raw);
   console.log('file_reference key exists?', 'file_reference' in raw, raw.file_reference);
  mapProtectionLegacy(payload, form.get('breaker_protection') as FormArray, 'BP', [
    'OV',
    'UV',
    'OVLD',
  ]);
  mapProtectionLegacy(payload, form.get('generator_switchboard_protection') as FormArray, 'GSP', [
    'OVT',
    'UVT',
    'RPR',
    'WTA',
  ]);

  mapInstrumentation(payload, form.get('instrumentation') as FormArray);
  mapGtgPanel(payload, form.get('gtg_panel_checks') as FormArray);
  mapMiscellaneous(payload, form.get('miscellaneous_checks') as FormArray);
  mapPhmOnSteadyState(payload, form.get('phm_on_steady_state') as FormArray);
  mapPhmOffSteadyState(payload, form.get('phm_off_steady_state') as FormArray);
  mapPhmTransient(payload, form.get('phm_on_transient') as FormArray, 'trnsntTstPhmON', GTG_PHM_TRANSIENT_ON_ROWS);
  mapPhmTransient(payload, form.get('phm_off_transient') as FormArray, 'trnsntTstPhmOFF', GTG_PHM_TRANSIENT_OFF_ROWS);
  mapGovernorRange(payload, form.get('governor_range') as FormArray);
  mapGovernorRate(payload, form.get('governor_rate') as FormArray);
  mapVoltageSteadyState(payload, form.get('voltage_steady_state') as FormArray);
  mapVoltageTransient(payload, form.get('voltage_transient') as FormArray);
  mapVoltageBalance(payload, form.get('voltage_balance') as FormArray);
  mapVoltageRange(payload, form.get('voltage_range_avr') as FormArray, 'voltRangeAVR');
  mapVoltageRange(payload, form.get('voltage_range_hand') as FormArray, 'voltRangeHC');
  mapParallelingRows(payload, form.get('dynamic_paralleling_trial_rows') as FormArray);

  return payload;
}

function mapProtectionLegacy(
  payload: LegacyPayload,
  rows: FormArray,
  group: string,
  suffixes: string[],
): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const sfx = suffixes[index];
    if (!sfx) return;
    payload[`proChck_${group}_${sfx}_CDate`] = val(v.calibration_date);
    payload[`proChck_${group}_${sfx}_CertSts`] = val(v.calibration_cert_provided);
    payload[`proChck_${group}_${sfx}_ObsVal`] = val(v.observed_value);
    payload[`proChck_${group}_${sfx}_Sts`] = val(v.status);
    payload[`proChck_${group}_${sfx}_Remarks`] = val(v.remarks);
    payload[`proChck_${group}_${sfx}_uploadFile`] = val(v.upload_file);
    
    
  });
}

function mapInstrumentation(payload: LegacyPayload, rows: FormArray): void {
  const keys = ['KWM', 'VM', 'AMM', 'FM', 'PFM'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = keys[index];
    if (!key) return;
    payload[`instrmtn_${key}_ops`] = val(v.ops_non_ops);
    payload[`instrmtn_${key}_CDate`] = val(v.calibration_date);
    payload[`instrmtn_${key}_CCertSts`] = val(v.calibration_cert_provided);
    payload[`instrmtn_${key}_Sts`] = val(v.status);
    payload[`instrmtn_${key}_Remarks`] = val(v.remarks);
    payload[`instrmtn_${key}_uploadFile`] = val(v.upload_file);
  });
}

function mapGtgPanel(payload: LegacyPayload, rows: FormArray): void {
  const keys = ['instrumentation_cables', 'instrumentation_cleanliness', 'instrumentation_calibration'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = keys[index];
    if (!key) return;
    payload[key] = val(v.status ?? v.details);
  });
}

function mapMiscellaneous(payload: LegacyPayload, rows: FormArray): void {
  const fieldMap = [
    'misc_main_stator',
    'misc_main_rotor',
    'misc_exciter_stator',
    'misc_exciter_rotor',
    'misc_condition_slip',
    'misc_condition_zinc',
    'misc_condensation',
    'misc_GTTT',
    'misc_communication',
    'misc_lighting',
    'misc_ventilation',
    'misc_generator',
    'misc_loose',
    'misc_generatr_Swbd',
    'misc_generatr_supply_brkr',
    'misc_ambient_temperature',
  ];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const key = fieldMap[index];
    if (!key) return;
    payload[key] = val(v.details);
    payload[`${key}_remarks`] = val(v.remarks);
    payload[`${key}_uploadFile`] = val(v.upload_file);
    
  });
}

function mapPhmOnSteadyState(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '25', '50', '75', '110'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`sst_PhmON_${load}_init_speed`] = val(v.initial_speed_hz);
    payload[`sst_PhmON_${load}_final_speed`] = val(v.final_speed_hz);
    payload[`sst_PhmON_${load}_freq_Modln`] = val(v.frequency_modulation);
    payload[`sst_remark${index + 1}`] = val(v.status);
  });
}

function mapPhmOffSteadyState(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '25', '50', '75', '110'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const meta = GTG_STEADY_STATE_OFF_ROWS[index];
    if (meta?.calculatedDroop) {
      payload['sst_PhmOFF_100to0_init_speed'] = val(v.initial_speed_hz);
      payload['sst_PhmOFF_100to0_final_speed'] = val(v.final_speed_hz);
      payload['sst_PhmOFF_100to0_freq_Modln'] = val(v.governor_droop);
      payload['sst_PhmOFF_remark6'] = val(v.status);
      return;
    }
    const load = loads[index];
    if (!load) return;
    payload[`sst_PhmOFF_${load}_init_speed`] = val(v.initial_speed_hz);
    payload[`sst_PhmOFF_${load}_final_speed`] = val(v.final_speed_hz);
    payload[`sst_PhmOFF_${load}_freq_Modln`] = val(v.frequency_modulation);
    payload[`sst_PhmOFF_remark${index + 1}`] = val(v.status);
  });
}

function mapPhmTransient(
  payload: LegacyPayload,
  rows: FormArray,
  prefix: string,
  rowMeta: { loadInitial: string; loadTo: string }[],
): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const meta = rowMeta[index];
    if (!meta) return;
    const key = `${meta.loadInitial}x${meta.loadTo}`.replace('+', 'M');
    payload[`${prefix}_${key}_init_speed`] = val(v.initial_speed_hz);
    payload[`${prefix}_${key}_mtry_speed`] = val(v.momentary_speed_hz);
    payload[`${prefix}_${key}_final_speed`] = val(v.final_speed_hz);
    payload[`${prefix}_${key}_peak_obs`] = val(v.peak_observed);
    payload[`${prefix}_${key}_final_value`] = val(v.recovery_final_value);
    payload[`${prefix}_${key}_recov_Obs`] = val(v.recovery_observed);
    payload[`${prefix}_remark${index + 1}`] = val(v.status);
  });
}

function mapGovernorRange(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '100'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`govrnr_range_${load}_measured`] = val(v.measured_frequency_hz);
    payload[`govrnr_range_${load}_remark`] = val(v.status);
  });
}

function mapGovernorRate(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '100'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`govrnr_motor_${load}_up`] = val(v.rate_up);
    payload[`govrnr_motor_${load}_down`] = val(v.rate_down);
    payload[`govrnr_motor_remark${index + 1}`] = val(v.status);
  });
}

function mapVoltageSteadyState(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '25', '50', '75', '100'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`vsst_${load}_val`] = val(v.kw);
    payload[`vsst_${load}_ObsVolt`] = val(v.volts_max);
    payload[`vsst_${load}_ObsVolt_min`] = val(v.volts_min);
    payload[`vsst_${load}_PF`] = val(v.power_factor);
    payload[`vsst_${load === '100' ? '110' : load}_ampReated`] = val(v.rated_amps);
    payload[`vsst_${load === '100' ? '110' : load}_ampObs`] = val(v.observed_amps);
    payload[`vsst_${load}_Volt_Modln`] = val(v.voltage_modulation);
    payload[`vsst_remark${index + 1}`] = val(v.status);
  });
}

function mapVoltageTransient(payload: LegacyPayload, rows: FormArray): void {
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const meta = GTG_VOLTAGE_TRANSIENT_ROWS[index];
    if (!meta) return;
    const key = meta.isMload
      ? `${meta.loadInitial}M`
      : `${meta.loadInitial}x${meta.loadTo}`;
    payload[`vtrt_${key}_init_volt`] = val(v.initial_voltage);
    payload[`vtrt_${key}_memtry_volt`] = val(v.momentary_voltage);
    payload[`vtrt_${key}_final_volt`] = val(v.final_voltage);
    payload[`vtrt_${key}_peak_obs`] = val(v.peak_observed);
    payload[`vtrt_${key}_final_value`] = val(v.final_value);
    payload[`vtrt_${key}_recov_Obs`] = val(v.recovery_observed);
    payload[`vtrt_remark${index + 1}`] = val(v.status);
  });
}

function mapVoltageBalance(payload: LegacyPayload, rows: FormArray): void {
  const loads = ['0', '100'];
  rows?.controls.forEach((row, index) => {
    const v = (row as FormGroup).getRawValue();
    const load = loads[index];
    if (!load) return;
    payload[`voltBalTst_${load}_RY`] = val(v.line_voltage_ry);
    payload[`voltBalTst_${load}_YB`] = val(v.line_voltage_yb);
    payload[`voltBalTst_${load}_BR`] = val(v.line_voltage_br);
    payload[`voltBalTst_${load}_diff`] = val(v.difference);
    payload[`voltBalTst_${load}_pLimit`] = val(v.permissible_limit);
    payload[`voltBalTst_${load}v_remarks`] = val(v.status);
  });
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

function mapParallelingRows(payload: LegacyPayload, rows: FormArray): void {
  if (!rows?.length) {
    payload['dynamic_paralleling_trial_rows'] = [];
    return;
  }

  payload['dynamic_paralleling_trial_rows'] = rows.controls.map((rowGroup, rowIndex) => {
    const row = (rowGroup as FormGroup).getRawValue();
    const legacyRow: LegacyPayload = {
      paralleling_trial_machine_1: val(row.paralleling_trial_machine_1),
      paralleling_trial_machine_2: val(row.paralleling_trial_machine_2),
      parallel_rated_dg1: val(row.parallel_rated_dg1),
      parallel_rated_dg2: val(row.parallel_rated_dg2),
      parallel_amps_dg1: val(row.parallel_amps_dg1),
      parallel_amps_dg2: val(row.parallel_amps_dg2),
    };

    for (const config of PARALLELING_SHARING_ROWS) {
      for (const unit of ['KW', 'KVA'] as const) {
        const prefix = parallelingLegacyFieldPrefix(config.direction, config.loadPercent, unit);
        const sharing = row[`${config.direction}_${config.loadPercent}_${unit.toLowerCase()}`] ?? {};
        legacyRow[`${prefix}_combined_val`] = val(sharing.combined_val);
        legacyRow[`${prefix}_proportionate`] = val(sharing.proportionate_a);
        legacyRow[`${prefix}_proportionate1`] = val(sharing.proportionate_b);
        legacyRow[`${prefix}_machineA`] = val(sharing.machine_a);
        legacyRow[`${prefix}_machineB`] = val(sharing.machine_b);
        legacyRow[`${prefix}_differences`] = val(sharing.difference);
        const ratingsKey =
          unit === 'KW'
            ? `unttnddprllng_${config.direction}_${config.loadPercent}_Kw_ratings`
            : `${prefix}_ratings`;
        legacyRow[ratingsKey] = val(sharing.tolerance_band);
        const remarksKey =
          unit === 'KW'
            ? `unttnddprllng_${config.direction}_${config.loadPercent}_remarks`
            : `${prefix}_remarks`;
        legacyRow[remarksKey] = val(sharing.status);
      }
    }

    legacyRow['_rowIndex'] = rowIndex;
    return legacyRow;
  });
}

function unwrapGtgPayload(payload: unknown): LegacyPayload {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as LegacyPayload;
  if (record['formGroupKey'] === 'loadTrialPerformaGTG') return record;
  const nested = record['loadTrialPerformaGTG'];
  if (nested && typeof nested === 'object') return nested as LegacyPayload;
  return record;
}

function pick<T>(payload: LegacyPayload, key: string): T | undefined {
  const value = payload[key];
  if (value === null || value === undefined || value === '') return undefined;
  return value as T;
}

export type GtgFormFillResult = {
  formPatch: Record<string, unknown>;
  parallelingTrial: 'yes' | 'no' | '';
  parallelingRows: LegacyPayload[];
};

/** Reverse-maps legacy API keys saved via `buildLoadTrialProformaGtgPayload` back to reactive form values. */
export function legacyPayloadToGtgFormFill(payload: unknown): GtgFormFillResult {
  const legacy = unwrapGtgPayload(payload);
  const formPatch: Record<string, unknown> = {
    trials_date: pick(legacy, 'trials_date'),
    gtg: pick(legacy, 'gtg'),
    kw: pick(legacy, 'equipment_KW'),
    ship: pick(legacy, 'shipID'),
    trial_report_no: pick(legacy, 'trial_report_no'),
    presented_by: pick(legacy, 'Presented_by'),
    trial_date: pick(legacy, 'trial_date'),
    trial_undertaken_by: pick(legacy, 'trials_undertaken_by'),
    occasion_of_current_trial: pick(legacy, 'occationOfCurrTrial') ?? pick(legacy, 'occation_of_trial'),
    date_of_last_trial: pick(legacy, 'lastTrialDate'),
    // file_reference: pick(legacy, 'referanceFileID'),
    proposal_reference: pick(legacy, 'referanceFileID'), 
    file_reference: pick(legacy, 'referanceFileText'),
    reference_document_for_trial:
      pick(legacy, 'referanceDocID') ?? 'Def Stan 08-142, EED-Q-242(R3) and GTG Technical Manual',
    test_equipment_used: pick(legacy, 'testEquipmentUsed'),
    engine_make: pick(legacy, 'engn_equipmentID'),
    engine_model_serial_no: pick(legacy, 'engn_equipmentSrNo'),
    engine_rpm: pick(legacy, 'engn_rpm_val'),
    governor_make: pick(legacy, 'govnr_equipmentID'),
    governor_model_serial_no: pick(legacy, 'govnr_equipmentSrNo'),
    governor_type: pick(legacy, 'govnr_type'),
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
    insulation_generator_to_switchboard_cable: pick(legacy, 'ir_gnrtr_cbl'),
    insulation_breaker: pick(legacy, 'ir_insltn_brkr'),
    nominal_frequency: pick(legacy, 'steadyStateNominalFriq'),
    nominal_voltage: pick(legacy, 'steadyStateVoltageFriq'),
    m_load_amps: pick(legacy, 'vtrt_m_load'),
    harmonic_content: pick(legacy, 'voltwavHorCont_max'),
    voltage_range_permissible_limit: pick(legacy, 'voltRangeAVR_0_Remarks'),
    gen_r_ship_engineer_officer: pick(legacy, 'Gen_r_ship_Engineer_Officer'),
    trial_officer: pick(legacy, 'trial_Officer'),
    recommendations: pick(legacy, 'recommendations'),
    final_status: pick(legacy, 'final_status'),
  };

  fillProtectionRows(formPatch, legacy, 'breaker_protection', 'BP', ['OV', 'UV', 'OVLD']);
  fillProtectionRows(formPatch, legacy, 'generator_switchboard_protection', 'GSP', [
    'OVT',
    'UVT',
    'RPR',
    'WTA',
  ]);
  fillInstrumentationRows(formPatch, legacy);
  fillGtgPanelRows(formPatch, legacy);
  fillMiscellaneousRows(formPatch, legacy);
  fillPhmOnSteadyStateRows(formPatch, legacy);
  fillPhmOffSteadyStateRows(formPatch, legacy);
  fillPhmTransientRows(formPatch, legacy, 'phm_on_transient', 'trnsntTstPhmON', GTG_PHM_TRANSIENT_ON_ROWS);
  fillPhmTransientRows(formPatch, legacy, 'phm_off_transient', 'trnsntTstPhmOFF', GTG_PHM_TRANSIENT_OFF_ROWS);
  fillGovernorRangeRows(formPatch, legacy);
  fillGovernorRateRows(formPatch, legacy);
  fillVoltageSteadyStateRows(formPatch, legacy);
  fillVoltageTransientRows(formPatch, legacy);
  fillVoltageBalanceRows(formPatch, legacy);
  fillVoltageRangeRows(formPatch, legacy, 'voltage_range_avr', 'voltRangeAVR');
  fillVoltageRangeRows(formPatch, legacy, 'voltage_range_hand', 'voltRangeHC');

  const parallelingTrial: 'yes' | 'no' | '' = legacy['paralleling_trial_enabled'] === true
    ? 'yes'
    : legacy['paralleling_trial_enabled'] === false
      ? 'no'
      : '';
  const parallelingRows = Array.isArray(legacy['dynamic_paralleling_trial_rows'])
    ? (legacy['dynamic_paralleling_trial_rows'] as LegacyPayload[])
    : [];

  return { formPatch, parallelingTrial, parallelingRows };
}

function fillProtectionRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  group: string,
  suffixes: string[],
): void {
  formPatch[arrayKey] = suffixes.map((sfx) => ({
    calibration_date: pick(legacy, `proChck_${group}_${sfx}_CDate`),
    calibration_cert_provided: pick(legacy, `proChck_${group}_${sfx}_CertSts`),
    observed_value: pick(legacy, `proChck_${group}_${sfx}_ObsVal`),
    status: pick(legacy, `proChck_${group}_${sfx}_Sts`),
    remarks: pick(legacy, `proChck_${group}_${sfx}_Remarks`),
    upload_file: pick(legacy, `proChck_${group}_${sfx}_uploadFile`),
  }));
}

function fillInstrumentationRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const keys = ['KWM', 'VM', 'AMM', 'FM', 'PFM'];
  formPatch['instrumentation'] = keys.map((key) => ({
    ops_non_ops: pick(legacy, `instrmtn_${key}_ops`),
    calibration_date: pick(legacy, `instrmtn_${key}_CDate`),
    calibration_cert_provided: pick(legacy, `instrmtn_${key}_CCertSts`),
    status: pick(legacy, `instrmtn_${key}_Sts`),
    remarks: pick(legacy, `instrmtn_${key}_Remarks`),
    upload_file: pick(legacy, `instrmtn_${key}_uploadFile`), 
  }));
}

function fillGtgPanelRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const keys = ['instrumentation_cables', 'instrumentation_cleanliness', 'instrumentation_calibration'];
  formPatch['gtg_panel_checks'] = keys.map((key, index) =>
    index === 2
      ? { details: pick(legacy, key) }
      : { status: pick(legacy, key) },
  );
}

function fillMiscellaneousRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const fieldMap = [
    'misc_main_stator',
    'misc_main_rotor',
    'misc_exciter_stator',
    'misc_exciter_rotor',
    'misc_condition_slip',
    'misc_condition_zinc',
    'misc_condensation',
    'misc_GTTT',
    'misc_communication',
    'misc_lighting',
    'misc_ventilation',
    'misc_generator',
    'misc_loose',
    'misc_generatr_Swbd',
    'misc_generatr_supply_brkr',
    'misc_ambient_temperature',
  ];
  formPatch['miscellaneous_checks'] = fieldMap.map((key) => ({
    details: pick(legacy, key),
    remarks: pick(legacy, `${key}_remarks`),
     upload_file: pick(legacy, `${key}_uploadFile`), 
  }));
}

function fillPhmOnSteadyStateRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '25', '50', '75', '110'];
  formPatch['phm_on_steady_state'] = loads.map((load, index) => ({
    initial_speed_hz: pick(legacy, `sst_PhmON_${load}_init_speed`),
    final_speed_hz: pick(legacy, `sst_PhmON_${load}_final_speed`),
    frequency_modulation: pick(legacy, `sst_PhmON_${load}_freq_Modln`),
    status: pick(legacy, `sst_remark${index + 1}`),
  }));
}

function fillPhmOffSteadyStateRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '25', '50', '75', '110'];
  formPatch['phm_off_steady_state'] = GTG_STEADY_STATE_OFF_ROWS.map((meta, index) => {
    if (meta.calculatedDroop) {
      return {
        initial_speed_hz: pick(legacy, 'sst_PhmOFF_100to0_init_speed'),
        final_speed_hz: pick(legacy, 'sst_PhmOFF_100to0_final_speed'),
        governor_droop: pick(legacy, 'sst_PhmOFF_100to0_freq_Modln'),
        status: pick(legacy, 'sst_PhmOFF_remark6'),
      };
    }
    const load = loads[index];
    return {
      initial_speed_hz: pick(legacy, `sst_PhmOFF_${load}_init_speed`),
      final_speed_hz: pick(legacy, `sst_PhmOFF_${load}_final_speed`),
      frequency_modulation: pick(legacy, `sst_PhmOFF_${load}_freq_Modln`),
      status: pick(legacy, `sst_PhmOFF_remark${index + 1}`),
    };
  });
}

function fillPhmTransientRows(
  formPatch: Record<string, unknown>,
  legacy: LegacyPayload,
  arrayKey: string,
  prefix: string,
  rowMeta: { loadInitial: string; loadTo: string }[],
): void {
  formPatch[arrayKey] = rowMeta.map((meta, index) => {
    const key = `${meta.loadInitial}x${meta.loadTo}`.replace('+', 'M');
    return {
      initial_speed_hz: pick(legacy, `${prefix}_${key}_init_speed`),
      momentary_speed_hz: pick(legacy, `${prefix}_${key}_mtry_speed`),
      final_speed_hz: pick(legacy, `${prefix}_${key}_final_speed`),
      peak_observed: pick(legacy, `${prefix}_${key}_peak_obs`),
      recovery_final_value: pick(legacy, `${prefix}_${key}_final_value`),
      recovery_observed: pick(legacy, `${prefix}_${key}_recov_Obs`),
      status: pick(legacy, `${prefix}_remark${index + 1}`),
    };
  });
}

function fillGovernorRangeRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '100'];
  formPatch['governor_range'] = loads.map((load) => ({
    measured_frequency_hz: pick(legacy, `govrnr_range_${load}_measured`),
    status: pick(legacy, `govrnr_range_${load}_remark`),
  }));
}

function fillGovernorRateRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '100'];
  formPatch['governor_rate'] = loads.map((load, index) => ({
    rate_up: pick(legacy, `govrnr_motor_${load}_up`),
    rate_down: pick(legacy, `govrnr_motor_${load}_down`),
    status: pick(legacy, `govrnr_motor_remark${index + 1}`),
  }));
}

function fillVoltageSteadyStateRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '25', '50', '75', '100'];
  formPatch['voltage_steady_state'] = loads.map((load, index) => ({
    kw: pick(legacy, `vsst_${load}_val`),
    volts_max: pick(legacy, `vsst_${load}_ObsVolt`),
    volts_min: pick(legacy, `vsst_${load}_ObsVolt_min`),
    power_factor: pick(legacy, `vsst_${load}_PF`),
    rated_amps: pick(legacy, `vsst_${load === '100' ? '110' : load}_ampReated`),
    observed_amps: pick(legacy, `vsst_${load === '100' ? '110' : load}_ampObs`),
    voltage_modulation: pick(legacy, `vsst_${load}_Volt_Modln`),
    status: pick(legacy, `vsst_remark${index + 1}`),
  }));
}

function fillVoltageTransientRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  formPatch['voltage_transient'] = GTG_VOLTAGE_TRANSIENT_ROWS.map((meta, index) => {
    const key = meta.isMload ? `${meta.loadInitial}M` : `${meta.loadInitial}x${meta.loadTo}`;
    return {
      initial_voltage: pick(legacy, `vtrt_${key}_init_volt`),
      momentary_voltage: pick(legacy, `vtrt_${key}_memtry_volt`),
      final_voltage: pick(legacy, `vtrt_${key}_final_volt`),
      peak_observed: pick(legacy, `vtrt_${key}_peak_obs`),
      final_value: pick(legacy, `vtrt_${key}_final_value`),
      recovery_observed: pick(legacy, `vtrt_${key}_recov_Obs`),
      status: pick(legacy, `vtrt_remark${index + 1}`),
    };
  });
}

function fillVoltageBalanceRows(formPatch: Record<string, unknown>, legacy: LegacyPayload): void {
  const loads = ['0', '100'];
  formPatch['voltage_balance'] = loads.map((load) => ({
    line_voltage_ry: pick(legacy, `voltBalTst_${load}_RY`),
    line_voltage_yb: pick(legacy, `voltBalTst_${load}_YB`),
    line_voltage_br: pick(legacy, `voltBalTst_${load}_BR`),
    difference: pick(legacy, `voltBalTst_${load}_diff`),
    permissible_limit: pick(legacy, `voltBalTst_${load}_pLimit`),
    status: pick(legacy, `voltBalTst_${load}v_remarks`),
  }));
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

export function legacyParallelingRowToFormPatch(legacyRow: LegacyPayload): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    paralleling_trial_machine_1: pick(legacyRow, 'paralleling_trial_machine_1'),
    paralleling_trial_machine_2: pick(legacyRow, 'paralleling_trial_machine_2'),
    parallel_rated_dg1: pick(legacyRow, 'parallel_rated_dg1'),
    parallel_rated_dg2: pick(legacyRow, 'parallel_rated_dg2'),
    parallel_amps_dg1: pick(legacyRow, 'parallel_amps_dg1'),
    parallel_amps_dg2: pick(legacyRow, 'parallel_amps_dg2'),
  };

  for (const config of PARALLELING_SHARING_ROWS) {
    for (const unit of ['kw', 'kva'] as const) {
      const prefix = parallelingLegacyFieldPrefix(config.direction, config.loadPercent, unit.toUpperCase() as 'KW' | 'KVA');
      const ratingsKey =
        unit === 'kw'
          ? `unttnddprllng_${config.direction}_${config.loadPercent}_Kw_ratings`
          : `${prefix}_ratings`;
      const remarksKey =
        unit === 'kw'
          ? `unttnddprllng_${config.direction}_${config.loadPercent}_remarks`
          : `${prefix}_remarks`;
      patch[`${config.direction}_${config.loadPercent}_${unit}`] = {
        combined_val: pick(legacyRow, `${prefix}_combined_val`),
        proportionate_a: pick(legacyRow, `${prefix}_proportionate`),
        proportionate_b: pick(legacyRow, `${prefix}_proportionate1`),
        machine_a: pick(legacyRow, `${prefix}_machineA`),
        machine_b: pick(legacyRow, `${prefix}_machineB`),
        difference: pick(legacyRow, `${prefix}_differences`),
        tolerance_band: pick(legacyRow, ratingsKey),
        status: pick(legacyRow, remarksKey),
      };
    }
  }

  return patch;
}
