export interface SrarLookupRecord {
  id?: number;
  name: string;
}

/** GET srar/master/routine-hours/ — the hour-based rows of the Frequency master, which
 *  are the "On Routine" choices for Step 13's R/H Extension tables. `id` is a
 *  master.Frequency pk, which is what RHExtension.on_routine points at. */
export interface SrarRoutineHourOption {
  id: number;
  label: string;
  hours: number;
}

/** GET srar/master/running-hours-equipment/ — real ShipEquipment instances linked via
 * the "Add SRAR Equipment" screen under one of Form 1's allowed categories. Also used
 * for GET srar/master/sfd-equipment-by-type/, which additionally sets location_on_board. */
export interface SrarRunningHoursEquipmentItem {
  id: number;
  equipment_name: string;
  nomenclature: string;
  equipment_code: string | null;
  serial_no: string | null;
  location_on_board?: string | null;
}

export interface SrarRecord {
  id: string | number;
  srarNo?: string;
  shipName?: string;
  month?: number | string;
  month_name?: string;
  year?: number;
  submissionDate?: string;
  approvalStatus?: "Approved" | "Pending" | "In Review" | "Draft" | "Submitted" | (string & {});
  status?: string;
  engineerOfficer?: string;
  cmms_sync_status?: boolean;
  cmmsSyncStatus?: boolean;
  can_edit?: boolean;
  can_export?: boolean;
  can_preview?: boolean;
  is_saved?: boolean;
  send_to_co?: boolean;
  co_approved?: boolean;
  hoursUnderway?: string;
  distanceRun?: number;
  fuelConsumed?: number;
}


export interface SrarRunningParameters {
  duringMonthHours?: string;
  duringMonthMinutes?: string;
  duringMonthDistance?: string;
  maxSpeedDuringMonth?: string;
  maxShaftRpm?: string;
  maxSpeedDate?: string;
  maxSpeedDurationHours?: string;
  maxSpeedDurationMinutes?: string;
}

export interface SrarFuelConsumption {
  bfLastMonth?: string;
  received?: string;
  consHarbor?: string;
  consAnchorage?: string;
  consSea?: string;
  totalCons?: string;
  defueled?: string;
  balLeftOnboard?: string;
}

export interface SrarAvcatStatus {
  bfLastMonth?: string;
  received?: string;
  givenToAc?: string;
  usedForTrials?: string;
  totalCons?: string;
  defueled?: string;
  balLeftOnboard?: string;
}

export interface SrarEefData {
  hoursUnderway?: string;
  eefFactor?: string;
  shipRemarks?: string;
}

export interface SrarReportDetail {
  id?: string | number;
  srarNo?: string;
  shipName?: string;
  month?: string;
  year?: number;
  submissionDate?: string;
  approvalStatus?: string;
  engineerOfficer?: string;
  runningParameters?: SrarRunningParameters;
  fuelConsumption?: SrarFuelConsumption;
  avcatStatus?: SrarAvcatStatus;
  eefData?: SrarEefData;
  [key: string]: unknown;
}

export interface SrarApplicationStatus {
  draft?: number;
  pending_co_review?: number;
  co_approved?: number;
  synced?: number;
  total?: number;
}

export interface SrarAnalyticsKpis {
  past_6_months_count?: number | string;
  active_status_count?: number | string;
  pending_drafts_count?: number | string;
  application_status?: SrarApplicationStatus;
  editable_srar_count?: number | string;
  history_logs_count?: number | string;
  [key: string]: unknown;
}

export interface SrarAnalyticsMonthlyTrendItem {
  month: string;
  month_num?: number;
  year?: number;
  submitted: number;
  draft: number;
  total?: number;
  label?: string;
  value?: number;
  primary?: boolean;
  color?: string;
  [key: string]: unknown;
}

export interface SrarAnalyticsMonthlyTrendResponse {
  trend: SrarAnalyticsMonthlyTrendItem[];
  [key: string]: unknown;
}

export interface SrarLifecycleDistributionItem {
  status: string;
  count: number;
  percentage: number;
  [key: string]: unknown;
}

export interface SrarAnalyticsYearlyStatusItem {
  status?: string;
  count?: number;
  percentage?: number;
  label?: string;
  value?: number;
  color?: string;
  [key: string]: unknown;
}

export interface SrarAnalyticsYearlyStatusResponse {
  year: number;
  total_year_records: number;
  lifecycle_distribution: SrarLifecycleDistributionItem[];
  [key: string]: unknown;
}

export interface SrarAnalyticsDashboardSummary {
  total_reports: number;
  approved_reports: number;
  pending_reports: number;
  draft_reports: number;
  [key: string]: unknown;
}

export interface SrarApiResponse<T = unknown> {
  /** String on most endpoints, but the CMMS sync endpoints report success as a
   *  boolean (`{"status": false, "message": ...}` in a 200 body) — so callers that
   *  check for a failed sync have to be able to compare against `false`. */
  status?: string | boolean;
  message?: string;
  id?: number | string;
  tab?: number;
  data?: T;
  item?: T;
  [key: string]: unknown;
}

// Export endpoint returns either a 202 task hand-off or a 200 synchronous fallback payload
export interface ExportSrarResponse {
  status?: string;
  message?: string;
  task_id?: string;
  task_status_url?: string;
  download_url?: string;
  filename?: string;
  file_path?: string;
  background_fallback?: boolean;
  [key: string]: unknown;
}

export interface SrarCarryForwardEquipmentHours {
  sfd_details: number | null;
  rhsi_till_current_month: number | null;
}

export interface SrarCarryForwardInjectorFip {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  nomenclature: string | null;
  loc_on_board: string | null;
  running_hours_since_installation: string | number | null;
}

export interface SrarCarryForwardSafetyDeviceCheck {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  nomenclature: string | null;
  loc_on_board: string | null;
}

export interface SrarCarryForwardGasTurbine {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  total_rh_si: number | null;
  rh_regime_1_si: number | null;
  rh_regime_2_si: number | null;
  rh_regime_3_si: number | null;
  no_of_cold_starts_si: number | null;
  no_of_hot_starts_si: number | null;
  no_of_false_starts_si: number | null;
  no_of_tech_starts_si: number | null;
  no_of_astern_engagements_count: number | null;
  no_of_stop_orders_si: number | null;
}

export interface SrarCarryForwardReductionGear {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  total_rh_si: string | null;
  total_rh_regime1_si: string | null;
  total_rh_regime2_si: string | null;
  total_rh_regime3_si: string | null;
  trailing_rh_si: string | null;
  service_life_si: string | null;
  no_of_eng_regime1_si: string | null;
  no_of_eng_regime2_si: string | null;
  no_of_eng_regime3_si: string | null;
  no_of_eng_regime4_si: string | null;
}

export interface SrarCarryForwardGtg {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  total_rh_si: string | null;
  no_of_cold_starts_si: number | null;
  no_of_hot_starts_si: number | null;
  no_of_battery_cold_starts_si: number | null;
  no_of_battery_hot_starts_si: number | null;
}

export interface SrarCarryForwardGtgReductionGear {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  in_months_si: number | string | null;
}

export interface SrarCarryForwardDieselReductionGear {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  hrs_since_installation: string | null;
}

export interface SrarCarryForwardFptMainEngine {
  date: string | null;
  occasion_reason: string | null;
  draught_fwd: number | null;
  draught_aft: number | null;
  displacement: number | null;
  max_speed: number | null;
  conducted_by: string | null;
  torsion_meter_reading: string | null;
  sea_state: string | null;
  pending_dr_activities_reason: string | null;
}

export interface SrarCarryForwardRhExtension {
  sfd_details: number | null;
  eqpt_code: string | null;
  eqpt_name: string | null;
  nomenclature: string | null;
  loc_on_board: string | null;
  serial_no: string | null;
  equipment_type: number | null;
  on_routine: number | null;
  on_routine_text: string | null;
  total_rh_in_month: string | null;
  rh_ext_at_conduct_of_ext_trial: string | null;
  authority_letter_for_extension_trial: string | null;
  rh_extension_granted_upto: string | null;
  rh_left_for_expiry_of_extension: string | null;
  trial_conducted_by: string | null;
}

export interface SrarCarryForward {
  fuel_balance_last_month: number | string;
  avcat_balance_last_month: number | string;
  since_commissioning_hours_last_month_hr?: number | string;
  since_commissioning_hours_last_month_min?: number | string;
  since_commissioning_distance_last_month?: number | string;
  equipment_hours: SrarCarryForwardEquipmentHours[];
  injector_fip: SrarCarryForwardInjectorFip[];
  safety_device_checks: SrarCarryForwardSafetyDeviceCheck[];
  gas_turbine: SrarCarryForwardGasTurbine[];
  reduction_gear: SrarCarryForwardReductionGear[];
  diesel_reduction_gear: SrarCarryForwardDieselReductionGear[];
  gtg: SrarCarryForwardGtg[];
  gtg_reduction_gear: SrarCarryForwardGtgReductionGear[];
  fpt_main_engine: SrarCarryForwardFptMainEngine | null;
  rh_extensions: SrarCarryForwardRhExtension[];
}

export interface SrarMasterItem {
  id: string;
  srarTab: string;
  nomenclature: string;
}

export interface EquipmentValidityItem {
  id: string;
  equipmentName: string;
  source: string;
  lastCalibrationDate: string;
  validityMonths: number;
  nextCalibrationDue: string;
}

export interface RunningUpdateItem {
  id: string;
  updateTitle: string;
  validTill: string;
  createdDate: string;
}

export interface ShipDetailItem {
  id: string;
  shipName: string;
  shipType: string;
  commissionDate: string;
}

export interface SectionEquipment {
  id: string;
  section: string;
  nomenclature: string;
}

export interface SrarReportHeader {
  id?: number;
  srar_month?: number;
  srar_year?: number;
  hours_underway_month_hr?: number;
  hours_underway_month_min?: number;
  distance_run_month?: string;
  max_speed?: number;
  max_speed_date?: string;
  max_shaft_rpm?: number;
  eo_name?: string;
  eo_rank?: string;
  eo_personal_no?: string;
  eo_writer_contact_no?: string;
  eo_contact_no?: string;
  cmms_sync_status?: boolean;
}

export interface SrarReportExploitationItem {
  id: number;
  // Joined read-only off the linked ShipEquipment by
  // SrarEquipmentExploitationSerializer — the row itself stores only the FK.
  eqpt_name?: string | null;
  nomenclature?: string | null;
  eqpt_code?: string | null;
  loc_on_board?: string | null;
  hrs_for_month_hrs?: number;
  hrs_for_month_min?: number;
  rhsi_till_current_month?: number;
}

export interface SrarReportBoilerItem {
  id: number;
  name?: string;
  serial_no?: string;
  hrs_steamed_in_month?: string;
  hrs_steamed_since_commissioning?: string;
  hrs_above_20_percent?: string;
}

export interface SrarReportActivityItem {
  id: number;
  from_date?: string;
  to_date?: string;
  ship_state?: string;
  ship_location?: string;
  ship_activity_type?: string;
  ship_activity_detail?: string;
  remarks?: string;
}

export interface SrarReportFuelItem {
  id: number;
  b_f_from_last_month?: number;
  recieved?: number;
  consumed_in_harbour?: number;
  consumed_at_sea?: number;
  total_consumed?: number;
  balance_left_on_board?: number;
}

export interface SrarReportIccpItem {
  id: number;
  nomenclature?: string;
  loc_on_board?: string;
  ops_or_non_ops?: string;
}

export interface SrarReportTestKitItem {
  id: number;
  description?: string;
  next_calibration_due_date?: string;
}

export interface SrarReportSdcItem {
  id: number;
  eqpt_name?: string;
  loc_on_board?: string;
  date_of_sdc?: string;
  last_sfc_trial_date?: string;
}

export interface SrarReportDgufItem {
  id: number;
  da_number?: string;
  rh_at_sea_and_anchorage?: string;
  rh_at_port?: string;
  total_rh_in_month?: string;
}

export interface SrarReportLubricantItem {
  id: number;
  name?: string;
  quantity?: number;
  unit?: string;
}

export interface SrarReportEef {
  id?: number;
  designed?: number;
  reason_for_exceeding?: string;
  ship_remarks?: string;
}

export interface SrarFullReportPayload {
  header?: SrarReportHeader;
  tab_1_equipment_exploitations?: SrarReportExploitationItem[];
  tab_2_boiler_data?: SrarReportBoilerItem[];
  tab_3_ship_activities?: SrarReportActivityItem[];
  tab_4_fuel_consumptions?: SrarReportFuelItem[];
  tab_5_iccp?: SrarReportIccpItem[];
  tab_6_test_kits?: SrarReportTestKitItem[];
  tab_7_safety_device_checks?: SrarReportSdcItem[];
  tab_8_dguf?: SrarReportDgufItem[];
  tab_12_lubricants?: SrarReportLubricantItem[];
  tab_14_eef?: SrarReportEef;
}

/** GET srar/analytics/exploitation/ — ship-life exploitation KPIs. */
export interface SrarExploitationKpis {
  /** Cumulative hours underway. Null when no return has ever carried it. */
  hours_underway_since_commissioning: number | null;
  hours_underway_since_commissioning_hhmm: string | null;
  /** Return the cumulative was last reported on, e.g. "Mar 2020". */
  hours_underway_as_of: string | null;
  distance_run_since_commissioning: number | null;
  distance_run_as_of: string | null;
  /** Derived from SRAR form 8 §2 column (A) Total RH Sea, in days. */
  days_at_sea: number | null;
  days_at_sea_hours: number | null;
  days_at_sea_returns: number;
  /** Derived from SRAR form 8 §2 column (E) Number of Hours in Harbour, in days. */
  days_at_harbour: number | null;
  days_at_harbour_hours: number | null;
  days_at_harbour_returns: number;
  /** "T_SRARMthlyShipRunning" once the SRAR pull has run, else "form_8". */
  days_at_sea_source?: string;
  days_at_harbour_source?: string;
}

/** GET srar/analytics/fuel-trend/ — one entry per return, oldest first. */
export interface SrarFuelTrendItem {
  /** The SrarMonthlyHeader id for this return — drill-down target for the chart. */
  header_id: number;
  month: string;
  month_num: number;
  year: number;
  /** Fuel Oil Consumption & Balance form's monthly total, in fuel_oil_units. */
  fuel_oil_consumed: number;
  /** AVCAT Status form's monthly total, in avcat_units — a different unit by design. */
  avcat_consumed: number;
}

export interface SrarFuelTrendResponse {
  series: SrarFuelTrendItem[];
  has_data: boolean;
  fuel_oil_units: string;
  avcat_units: string;
  /** Years with at least one saved SRAR return, newest first — for the dashboard's year filter. */
  available_years?: number[];
  selected_year?: number | null;
}

/** One return's contribution to a diesel alternator's DGUF total — the
 *  dashboard's drill-down list for that bar. */
export interface SrarDgufBreakdownRow {
  header_id: number;
  year: number;
  month_num: number;
  month: string;
  at_sea_anchorage: number;
  at_port: number;
  total: number;
}

/** GET srar/analytics/dguf/ — running hours per diesel alternator. */
export interface SrarDgufItem {
  da: string;
  at_sea_anchorage: number;
  at_port: number;
  total: number;
  breakdown: SrarDgufBreakdownRow[];
}

export interface SrarDgufResponse {
  series: SrarDgufItem[];
  has_data: boolean;
  units: string;
  available_years?: number[];
  selected_year?: number | null;
}
