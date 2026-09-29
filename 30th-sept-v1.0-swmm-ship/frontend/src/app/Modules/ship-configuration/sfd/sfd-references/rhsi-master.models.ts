/** One equipment row on the RHSI Master table — the bulk editor behind the Step 2
 *  sub-department gate, also where ILMS Vendor Code / System Status / RHSI are set. */
export interface RhsiMasterEquipment {
  id: number;
  department_id: number | null;
  department_name: string;
  nomenclature: string;
  sub_department_id: number | null;
  ilms_vendor_code: string;
  system_status: string;
  eq_rhsi: string | null;
  rhsi_initialised: boolean;
  rhsi_updated_until: string | null;
  equipment_name: string | null;
  equipment_code: string | null;
  sub_dept_source: "CMMS" | "SWMM" | "NOT_ASSIGNED";
}

export interface RhsiMasterDepartmentOption {
  id: number;
  name: string;
}

export interface RhsiMasterSubDepartmentOption {
  id: number;
  name: string;
  department_id: number | null;
}

export interface RhsiMasterDepartmentSummary {
  id: number;
  name: string;
  total: number;
  assigned: number;
  unassigned: number;
  /** How many Sub Department master rows exist for this department at all — 0 means no
   *  amount of assigning on this page can close the gap; someone has to add sub
   *  departments to this department's masters first. */
  sub_department_count: number;
}

export interface RhsiMasterListResponse {
  status: boolean;
  can_see_all_departments: boolean;
  can_auto_assign_sub_departments: boolean;
  department_options: RhsiMasterDepartmentOption[];
  sub_departments: RhsiMasterSubDepartmentOption[];
  summary: {
    total: number;
    assigned: number;
    unassigned: number;
    by_department: RhsiMasterDepartmentSummary[];
  };
  equipments: RhsiMasterEquipment[];
}

/** One row's edits, sent only for rows the operator actually touched. */
export interface RhsiMasterSaveRow {
  id: number;
  vendor_code?: string;
  sub_department_id?: number | null;
  system_status?: string;
  rhsi_status?: "YES" | "NA";
  rhsi_value?: string;
  rhsi_date?: string;
}

export interface RhsiMasterSaveResponse {
  status: boolean;
  message: string;
  updated_count: number;
}

export interface RhsiMasterAutoAssignResponse {
  status: boolean;
  message?: string;
  assigned_total: number;
  by_department: {
    department: string;
    assigned: number;
    distribution: { sub_department: string; total: number }[];
  }[];
  skipped_departments: { department: string; reason: string }[];
  /** Rows with no `department` at all (not just no Sub Department) — Auto Assign can only
   *  balance load across a KNOWN department's existing sub departments, so these are never
   *  touched here; they still show up in this table (ADMIN/SHIPADMIN see every department) for
   *  a manual per-row Sub Department pick instead. See RHSIMasterAutoAssignAPIView's own doc
   *  (sfd/source_contract.py) for why this can't just be silently dropped from the response the
   *  way it used to be — without it, "N assigned" reads as complete even when this count is
   *  still stuck at the same value it was before the click. Ported from Aug_15. */
  department_less_count: number;
  department_less_sample: { id: number; nomenclature: string }[];
}
