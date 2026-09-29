export interface OpenDefect {
  id: number;
  dart_number: string;
  dart_date: string;
  rectification_date: string;
  status: string;
  nomenclature: string;
  defective_discriptions: string;
  sub_dept: string;
  eq_name: string;
  occasion: string;
  maintenance_period: string;
  remarks: string;
  opra_no: string;
  dl_no: string;
  cmms_sync_status: boolean;
  is_gd: boolean;
  is_overdue: boolean;
}

export interface Department {
  id: number;
  name: string;
}

/** Result of POST api/v1/dart/push-selected-to-cmms/ and .../sync-all-with-cmms/. */
export interface CmmsDartPushResult {
  status: boolean;
  message: string;
  /** How many DARTs were submitted. Selected-push only. */
  selected?: number;
  pushed: number;
  failed: number;
  /** Selected DARTs skipped because CMMS already had them. Selected-push only. */
  already_synced?: number;
  /** Closure pushes only: selected DARTs with no closure recorded locally yet. */
  not_closed?: number;
  defect_count?: number;
  guarantee_count?: number;
  aber_count?: number;
  errors?: { dart_number: string; error: string }[];
}

export interface OpenDefectsResponse {
  is_privileged: boolean;
  all_departments: Department[];
  selected_dept_id: number | null;
  filter_options: {
    sub_departments: string[];
    maintenance_periods: string[];
    dart_occasions: string[];
    equipment_nomenclatures: string[];
    equipment_names: string[];
    dateRange: string[];
  };
  open_defects: OpenDefect[];
  dl_3_defects: OpenDefect[];
}

export type FilterOption = string | { id: string | number; name: string };

export interface Spare {
  pattern: string;
  description: string;
  inventory_type: string;
  quantity: number;
}

export interface DefectDetail {
  dart_number: string;
  dart_date: string;
  occasion: string;
  maintenance_period: string;
  nomenclature: string;
  equipment_code: string;
  sub_dept: string;
  department: string;
  serial_no: string;
  location: string;
  previous_dart_no: string;
  rha_defect: string;
  created_date: string;
  rectification_date: string;
  symptoms: string;
  severity: string;
  assistance: string;
  defective_component: string;
  resolved_by: string;
  trial_required: string;
  trial_agency: string;
  description: string;
  sapres_required: string;
  spares?: Spare[];
}

export interface DartDetailsApiResponse {
  data: DefectDetail;
}
