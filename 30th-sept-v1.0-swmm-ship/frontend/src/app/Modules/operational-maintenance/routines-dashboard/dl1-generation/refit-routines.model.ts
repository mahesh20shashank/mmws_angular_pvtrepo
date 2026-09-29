export interface SelectOption {
  label: string;
  value: number | string;
}

export type NumericOrTextValue = number | string | null;

// GET api/v1/refit/refit_search/ — one row per row of RefitRoutineSerializer.
export interface RefitRoutineListItem {
  id: number;
  pk: number;
  equipment_name: string;
  section: string;
  department: string;
  routine_name: string;
  routine_category: string;
  frequency: string;
  frequency_in_months: number | null;
  frequency_in_hours: number | null;
  last_routine_completion_date: string | null;
  last_routine_completion_atrunning_hrs: NumericOrTextValue;
  next_due_date: string | null;
  next_due_running_hours: NumericOrTextValue;
  available_running_hours: NumericOrTextValue;
  remarks: string;
  converted: boolean;
  converted_at: string | null;
  routine_counts: { total: number; dyd: number; ss: number };
  maintop_no: string;
  running_hrs_updated_tilldate: string | null;
  total_running_hrs: NumericOrTextValue;
  total_routines: number;
  dyd_routines: number;
  ss_routines: number;
}

export interface RefitSearchListResponse {
  count: number;
  results: RefitRoutineListItem[];
}

// GET api/v1/refit/refit_search/{id}/ — RefitRoutineDetailSerializer
export interface RefitRoutineDescriptionItem {
  id: number;
  maintop_no: string;
  dart_number: string;
  routine_no: string;
  routine_description: string;
  by_whom: string;
  spare_used: boolean;
}

export interface RefitRoutineDetail extends RefitRoutineListItem {
  routine_descriptions: RefitRoutineDescriptionItem[];
}

// GET api/v1/ems/generatedl1/ — RoutineDescription rows flagged is_dl_draft=True.
// Serialized with fields="__all__" on the backend, so FK fields (equipment_name,
// routine_name) come through as raw PK ints, not display names.
export interface DlDraftRoutine {
  id: number;
  equipment_name: number | null;
  routine_name: number | null;
  add_routine_details?: number | null;
  maintop_no: string;
  dart_number: string;
  routine_no: string;
  routine_description: string;
  by_whom?: string;
  is_dl_draft: boolean;
  [key: string]: unknown;
}

// Also fields="__all__" — exact field names beyond `id` aren't pinned down,
// so callers should fall back across a few likely label fields.
export interface RefitMaintenancePeriodOption {
  id: number;
  [key: string]: unknown;
}

export interface GenerateDl1ListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    dl_drafts: DlDraftRoutine[];
    refit_list: RefitMaintenancePeriodOption[];
  };
}

export interface SaveDlDraftRowPayload {
  id: number;
  dl_number?: string;
  additional_remarks?: string;
  remarks?: string;
}

export interface SaveDlDraftRowsPayload {
  rows: SaveDlDraftRowPayload[];
  yard?: string;
  refit_type?: number | string;
}
