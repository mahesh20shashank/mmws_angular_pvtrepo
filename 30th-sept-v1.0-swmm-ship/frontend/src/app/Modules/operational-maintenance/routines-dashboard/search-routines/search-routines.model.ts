export interface SelectOption {
  label: string;
  value: number | string;
}

export interface HeaderStats {
  due: number;
  dueLessThan3M: number;
  due3To6M: number;
  other: number;
}

export interface RoutineItem {
  id: number;
  section_id: number;
  section_name: string;
  equipment_id: number;
  equipment_name: string;
  routine_type: string;
  routine_name: string;
  maintop_no: string;
  total_sub_routines?: number | string;
  dyd_routine_count?: number | string;
  last_routine_date: string;
  next_due_date: string;
  last_routine_running_hours: string;
  next_due_running_hours: string;
  total_running_hours: string;
  running_hours_updated_till: string;
  running_hours_available: string;
  due_status: string;
  due_bucket: string;
  status_color: string;
  remarks?: string;
}

export interface SearchRoutineResponse {
  filters: {
    sections: {
      id: number;
      label: string;
    }[];

    equipment: {
      id: number;
      label: string;
    }[];

    routine_types: {
      value: string;
      label: string;
    }[];

    routine_names: {
      value: string;
      label: string;
    }[];
  };

  counts: {
    due: number;
    due_lt_3m_500h: number;
    due_3_6m_1000h: number;
    other: number;
    total: number;
  };

  items: RoutineItem[];
}

// Raw shape returned by GET api/v1/ems/search_detail_plan/{pk}/ — the
// planned-routine detail row(s) for a given AddRoutineDetails pk.
export interface PlannedRoutineDetail {
  pk: number;
  routine_name: string;
  equipment_name: string;
  maintop_no: string;
  dart_number: string;
  routine_description: string;
  routine_no: string;
  planned_commencement_date: string;
  rhsi: string | number;
  rhsi_updated_until: string;
  previous_routine_completed_date: string;
  due_date: string;
  due_at_rh: string | number;
  previous_completed_at_rh: string | number;
  action_by: string;
  spare_used: boolean;
  row_style: string;
  spare_req: "YES" | "NO";
  category_data: unknown;
}

// Raw shape returned by GET api/v1/ems/search_detail/{pk}/ (SearchDetailView)
// — the not-yet-planned routine detail row(s) for a given AddRoutineDetails pk.
export interface SearchDetailResultItem {
  pk: number;
  routine_name: string;
  equipment_name: string;
  maintop_no: string;
  dart_number: string;
  routine_description: string;
  routine_no: string;
  previous_routine_completed_date: string;
  due_date: string;
  due_at_rh: string | number;
  previous_completed_at_rh: string | number;
  action_by: string;
  due_status: string;
  status_color: string;
}

// GET api/v1/ems/search/ (SearchMergedView) — paginated via DRF's
// PageNumberPagination (CustomPagination on the backend).
export interface EmsSearchPlanResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: EmsSearchResultItem[];
}

export interface EmsSearchResultItem {
  pk: number;
  routine_name: string;
  section: string;
  equipment_name: string;
  /** Number of sub-routines (RoutineDescription rows) under this routine. */
  total_sub_routines: number;
  maintop_no: string;
  dyd_routine_count?: number | string;
  dyd_routines?: number | string;
  last_routine_date: string;
  date: string;
  last_routine_running_hrs: string | number;
  next_due_running_hrs: string | number;
  total_running_hrs: string | number;
  running_hrs_updated_tilldate: string;
  running_hrs_available: string | number;
  valid_upto: string;
  due_status: string;
  status_color: string;
  remarks?: string;
}
export interface RoutineDetailResponse {
  routine: RoutineSummary;
  counts: RoutineCounts;
  items: RoutineDetailItem[];
}

export interface RoutineSummary {
  add_routine_id: number;
  maintop_no: string;
  routine_name: string;
  equipment_name: string;
  routine_type: string;
  section_name: string;
  dynamic_running_hours: number;
}

export interface RoutineCounts {
  due: number;
  due_lt_3m_500h: number;
  due_3_6m_1000h: number;
  other: number;
  total: number;
}

export interface RoutineDetailItem {
  id: number;
  routine_name: string;
  equipment_name: string;
  maintop_no: string;
  dart_number: string;
  routine_description: string;
  routine_no: string;
  previous_routine_completed_date: string;
  due_date: string;
  due_at_rh: string;
  previous_completed_at_rh: string;
  action_by: string;
  due_status: string;
  due_bucket: string;
  status_color: string;
}
export interface RoutinePlanResponse {
  routine: RoutinePlan;
  lookup: RoutineLookup;
  spares: SelectedSpare[];
}

export interface RoutinePlan {
  id: number;
  add_routine_id: number;
  sub_department: string;
  equipment_name: string;
  equipment_nomenclature: string;
  section_name: string;
  rhsi: string;
  maintop_no: string;
  routine_no: string;
  dart_no: string;
  routine_name: string;
  routine_description: string;
  due_date: string;
  due_at_rh: string;
  routine_due_rh: string;
  previous_completed_date: string;
  previous_completed_at_rh: string;
  action_by: string;
  planned_commencement_date: string;
  spares_required: "YES" | "NO";
}

export interface SpareLookupItem {
  code: string;
  name: string;
  description?: string;
  mapped_equipment_class?: string;
}

export interface Denomination {
  id: number;
  name: string;
}

export interface RoutineLookup {
  obs_pil_mapped: SpareLookupItem[];
  obs_pil_unmapped: SpareLookupItem[];

  mo_all: SpareLookupItem[];
  mo_mapped: SpareLookupItem[];

  wed_all: SpareLookupItem[];
  wed_mapped: SpareLookupItem[];

  denominations: Denomination[];
}

export interface SelectedSpare {
  pattern_number: string;
  oem_part_number: string;
  spare_description: string;
  inventory_type: string;
  wed_inventory_type: string;
  quantity_required: number;
  action: string;
}
