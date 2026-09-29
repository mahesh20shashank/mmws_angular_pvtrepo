export interface FUSSTriggerRoutine {
  pk: number;
  add_routine_pk: number;
  sr_ids: number[];

  sub_dept: string;
  equipment_nomenclature: string;
  routine_name: string;

  status: string;
  prev_completion_date: string;
  next_due_date: string;

  total_rh_updated_upto: string;
  rhsi: number;
  routine_completed_at_rh: number;
  routine_due_at_rh: string;

  maintops_no: string;

  total_sub_subroutines: number;
  ss_routines: number;
  dyd_routines: number;
}

// GET api/v1/ems/fuss_trigger_list/ — paginated via DRF's PageNumberPagination
// (CustomPagination on the backend); the three filter-option lists are added onto the
// paginated response as extra top-level keys (see FussTriggerListAPIView.get).
export interface FUSSTriggerListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FUSSTriggerRoutine[];

  equipment_sections: string[];
  equipments_names: string[];
  routine_names: string[];
}

// GET api/v1/ems/fuss_raised_routines/ — returns the full (unpaginated) list of open
// (isclosed_fuss=False) FussRaiseDetails, deduplicated by (department, equipment, routine
// name), plus the distinct filter-option lists derived from that same list.
export interface FUSSRaisedRoutine {
  id: number;
  department: string;
  equipment: string;
  routine_name: string;
  status: string;
  maintop_no: string;
  routines_by_dyd: number;
  routines_by_ss: number;
  total_routines: number;
  routines_due: number;
  due_date: string;
}

export interface FUSSRaisedRoutinesResponse {
  fuss_list: FUSSRaisedRoutine[];
  departments: string[];
  equipments: string[];
  routine_types: string[];
  dept_equipment_map: Record<string, string[]>;
}

// GET api/v1/ems/fuss_raised_details/?routine=<routine-name> — the still-open
// (isclosed_fuss=False) FussRaiseDetails entries under one routine name, i.e. the
// per-entry drill-down from a FUSS Trigger List row.
export interface FussRaisedDetailRow {
  id: number;
  ship: string;
  department: string;
  serial_no: string;
  fuss_date: string;
  due_date: string;
  equipment: string;
  maintop_no: string;
  frequency: string;
  routine_id: number | null;
  routine_no: string;
  routine_name: string;
  // Not yet returned by GET api/v1/ems/fuss_raised_details/ — backend needs to add
  // these from RoutineDescription (dart_number, routine_description) before these
  // columns will show real data instead of blanks.
  dart_number?: string;
  routine_description?: string;
}

export interface FussRaisedDetailsResponse {
  fuss_list: FussRaisedDetailRow[];
}

// GET api/v1/ems/close_raise_fuss/<pk>/ — pk is the RoutineDescription id. Prefill data
// for the Close FUSS form.
export interface CloseRaiseFussResponse {
  planned_routine: {
    pk: number;
    maintop_no: string;
    dart_number: string | null;
    routine_no: string;
    routine_description: string;
  };
  planned_obj: {
    pk: number;
    planned_commencement_date: string | null;
  } | null;
  spares_for_routine: { pattern_number: string; quantity_required: number }[];
  issue_list: { id: number; voucher_no: string; date: string }[];
  rankname: string;
  fullname: string;
  rank_obj: { id: number; name: string }[];
}

// POST api/v1/ems/complete_fuss/<pk>/
export interface CompleteFussPayload {
  complete_date: string;
  hours: number | null;
  minutes: number | null;
  carried_by: string;
  p_no: string;
  rank: number | null;
  total_manpower: number | null;
  running_hour: number | null;
  due_running_hour: number | null;
  completion_details: string;
  remarks: string;
  trial_team: boolean;
  rec_for_deletion: boolean;
  old_dart_number: string;
  not_applicable: boolean;
  rec_deletion: boolean;
  spares: string[];
}

export interface CloseRoutineResponse {
  old_dart_number: string | null;
  equipment_class: string;
  equipment_serial_no: string;
  nomenclature: string;
  due_date: string;
  last_completion_date: string | null;
  maintop_remarks: string;
  location_on_board: string;
  maintop_routine_number: string;
  routine_description: string;

  minutes_range: number[];
  hours_range: number[];

  fullname: string;
  rankname: string;

  rank_obj: Rank[];

  max_hours: number;

  planned_routine: PlannedRoutine;

  planned_obj: PlannedRoutine | null;

  spares_for_routine: SpareForRoutine[];

  issue_list: Issue[];
}

export interface Rank {
  rankid: number;
  rankdescription: string;
  universal_id_m_ranklist: number | null;
  universal_id_m_department: number | null;
  createdby: string | null;
  createddate: string | null;
  updatedby: string | null;
  updateddate: string | null;
  active: boolean;
}

export interface PlannedRoutine {
  id: number;
  maintop_no: string;
  dart_number: string | null;
  routine_no: string;
  routine_description: string;
  by_whom: string;
  is_fuss: boolean;

  last_routine_completion_date: string | null;
  last_routine_completion_atrunning_hrs: number | null;

  universal_id_t_dart: number | null;
  universal_id_t_routine_list: number | null;

  dart_sr_no: number | null;

  due_date: string;
  previous_completed_date: string | null;

  due_at_rh: number | null;
  previous_completed_at_rh: number | null;

  is_close: boolean;
  is_greater_than_3_monthly: boolean;

  created_on: string;
  updated_on: string;

  is_ra_initiate: boolean;
  is_dl_initiate: boolean;
  is_ra_draft: boolean;
  is_dl_draft: boolean;

  open_cmms_sync_date: string | null;
  close_cmms_sync_date: string | null;

  open_cmms_sync_status: boolean;
  close_cmms_sync_status: boolean;

  equipment_name: number;
  routine_name: number;
  add_routine_details: number;
  department_f_key: number;

  previous_routine: number | null;
  maintop_detail: number | null;
}

export type SpareForRoutine = Record<string, unknown>;

export type Issue = Record<string, unknown>;
export interface CloseRoutinePayload {
  date_of_completion: string;
  running_hour: number;
  rank_routine: number;
  rank_other: string;
  hours: number;
  minutes: number;
  carried_by: string;
  p_no: string;
  total_manpower: number;
  due_running_hour: number;
  remarks: string;
  completion_details: string;
  trial_team: string;
  rec_for_deletion: string;
  old_dart_number: string;
  spares: SpareForRoutine[];
}
export interface RaiseFussPayload {
  ship: string;
  department: string;
  serial_no: string;
  location_on_board: string;
  equipment: string;
  location_code: string;
  equipment_sr_no: string;
  maintop_no: string;
  frequency: string;

  selected_ids: number[];

  amendment_no: string;
  fuss_date: string;
  last_undertaken: string;
  due_date: string;
  schedule_date: string;

  recomm_deferment: number;
  reason: number;
  inability: number;

  mos_wed?: number;
  yard?: number;

  last_smp_completed?: string;
  last_smp_duration?: string;
  last_amp_completed?: string;
  last_amp_duration?: string;
  amp_smp_required_wef?: string;
  amp_smp_duration?: string;

  remarks?: string;
  demand_details?: string;

  spares_data?: Record<string, unknown>;
}
// ======================== Raise FUSS ========================

export interface RaiseFussResponse {
  routines: RaiseFussRoutine[];
  selected_ids: string[];

  deferments: RaiseFussDeferment[];
  inabilities: RaiseFussInability[];
  reasons: RaiseFussReason[];

  spare_obj: RaiseFussSpare[];

  establishment_obj: RaiseFussEstablishment[];

  organizations_obj: RaiseFussOrganization[];
}

export interface RaiseFussRoutine {
  id: number;
  routine_no: string;
  routine_description: string;
  maintop_no: string;
  frequency: string;
  category: string;

  equipment_name: string;
  dart_no: string;

  ship: string;
  sub_department: string;

  serial_no: string;
  location_on_board: string;
  location_code: string;
  equipment_sr_no: string;
}

export interface RaiseFussDeferment {
  id: number;
  description: string;
  code: string;
}

export interface RaiseFussInability {
  id: number;
  description: string;
  universal_id_m_reason: string | null;
}

export interface RaiseFussReason {
  id: number;
  description: string;
  code: string;
  universal_id_m_reason: string | null;
}

export interface RaiseFussSpare {
  pattern_number: string;
  description: string;
  name: string;
}

export interface RaiseFussOrganization {
  id: number;
  name: string;
}

export interface RaiseFussEstablishment {
  id: number;
  name: string;
}
