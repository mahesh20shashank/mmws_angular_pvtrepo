export interface UniqueMaintopRoutine {
  pk: number;
  equipment_name: string;
  equipment_code: string;
  maintop_no: string;
  eq_count: number;
  routine_count: number;
  sub_routine_count: number;
  dyd_routine_count: number;
}

export interface RoutineNameFilterOption {
  routine_id: number;
  routine_brief_description: string | null;
}

export interface UniqueMaintopFilterOptions {
  sub_departments: SubDepartment[];
  equipment_names: string[];
  routine_categories: string[];
  routine_names: RoutineNameFilterOption[];
}

export interface UniqueMaintopResponse {
  result: UniqueMaintopRoutine[];
  filter_options: UniqueMaintopFilterOptions;
}
export interface SubDepartment {
  id: number;
  name: string;
}
