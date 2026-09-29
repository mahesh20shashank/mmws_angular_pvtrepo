/**
 * Raw wire-shape DTOs returned by `backend/crew_manage` (see `backend/crew_manage/serializers.py`
 * / `backend/crew_manage/views.py`, mounted at `api/v1/crew-management/`). snake_case; several
 * endpoints (`personnel-status-dashboard/`, `watchbill/`, `sailings/{id}/`) are hand-built dicts
 * rather than plain `ModelSerializer` output. The service adapts these into the camelCase UI
 * models in `../models/crew.model.ts`.
 */

export interface BackendLeaveApplication {
  id: number;
  personal_number: string;
  rank: string;
  name: string;
  department: string;
  designation: string;
  leave_type: string;
  has_prefix: boolean;
  prefix_start_date: string | null;
  start_date: string;
  end_date: string;
  suffix_completion_date: string | null;
  reporting_date: string | null;
  no_of_days: number;
  station: string;
  reason: string;
  remark: string;
  application_status: string;
  rejection_reason: string;
  applied_at: string;
}

/** Row shape of `GET leave-forecast/applications/?start=&end=` — a hand-built `.values()` dict,
 * not the `LeaveApplicationViewSet` serializer, and NOT scoped to the caller (unlike
 * `leave-applications/`'s list action) — the real ship-wide source for a History view.
 * Notably missing `reporting_date` and `rejection_reason` (the endpoint returns `remark`
 * instead, a distinct model field with different meaning — not interchangeable). */
export interface BackendLeaveForecastApplicationRow {
  id: number;
  personal_number: string;
  rank: string;
  name: string;
  department: string;
  designation: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  no_of_days: number;
  station: string;
  application_status: string;
  remark: string;
  reason: string;
  applied_at: string;
  has_prefix: boolean;
  prefix_start_date: string;
  suffix_completion_date: string;
}

export interface BackendLeaveForecastApplicationsResponse {
  data: BackendLeaveForecastApplicationRow[];
}

/** Row shape of `GET leave-forecast/logs/?start=&end=` — real `PersonnelStatusLog` rows (a
 * `.values()` dict), not applications. */
export interface BackendLeaveForecastLogRow {
  id: number;
  personnel_number: string;
  rank: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  log_date: string;
}

export interface BackendLeaveForecastLogsResponse {
  data: BackendLeaveForecastLogRow[];
}

/** Response shape of `POST leave-applications/apply_on_behalf/` (auto-approved, so it returns
 * this summary rather than the full serialized application). */
export interface BackendLeaveApplyShortcutResponse {
  status: string;
  message: string;
  no_of_days: number;
  application_id: number;
}

/** `GET leave-applications/check_conflict/?personal_number=...`. */
export interface BackendLeaveConflictCheck {
  has_conflict: boolean;
  application_id?: number;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
  new_end_date?: string;
  current_status?: string;
}

/** `POST leave-applications/{id}/truncate/`. */
export interface BackendTruncateLeaveResponse {
  success: boolean;
  new_end_date: string;
}

/** `POST personnel-status/update/`. */
export interface BackendUpdatePersonnelStatusResponse {
  success: boolean;
  action: string;
}

export interface BackendCivilian {
  id: number;
  name_snapshot: string;
  role: string;
  person_type: string;
  rank_snapshot: string;
  pno_snapshot: string;
  desig_snapshot: string;
  service_no: string;
  fleet: string;
  ship: string;
  ref_id: string;
  contact: string;
  remarks: string;
}

export interface BackendRank {
  id: number;
  name: string;
  department: number | null;
}

export interface BackendRankClassification {
  id: number;
  rank_name: string;
  classification: string;
  created_at: string;
  updated_at: string;
}

/** Matches `SailingListSerializer` exactly (verified against `SailingViewSet.list()`, which
 * wraps the array as `{sailings: [...]}`) — note `start`/`end`/`co`/`xo` (not `start_date` /
 * `end_date` / `co_name` / `xo_name`), and `personnel_count` computed server-side rather than
 * needing a separate `watchbill/personnel/` aggregate call. No `civilians` field on this row
 * shape (only the detail endpoint returns civilian records). */
export interface BackendSailing {
  id: number;
  name: string;
  area: string;
  start: string;
  end: string;
  co: string;
  xo: string;
  status: "active" | "completed";
  completed_at: string | null;
  personnel_count: number;
}

export interface BackendSailingListResponse {
  sailings: BackendSailing[];
}

export interface BackendSailingCreateResponse {
  status: string;
  id: number;
  personnel_count: number;
  copied_personnel: number;
  copied_assignments: number;
}

export interface BackendSailingPersonnelRow {
  rank: string;
  name: string;
  pno: string;
  desig: string;
  watch: string;
  action: string;
  status: string;
}

export interface BackendSailingDetail {
  id: number;
  name: string;
  area: string;
  start: string;
  end: string;
  co: string;
  xo: string;
  status: "active" | "completed";
  personnel_count: number;
  civilians: { id: number; name: string; role: string; ref_id: string; contact: string; remarks: string }[];
  departments: Record<string, BackendSailingPersonnelRow[]>;
}

export interface BackendAssignmentRow {
  id: number;
  pno: string;
  name: string;
  rank: string;
  dept: string;
  desig: string;
  w3: string;
  w2: string;
  action: string;
  defence: string;
  cruising: string;
  shelter: string;
  emergency: string;
  lr: string;
  mess: string;
  blood_group: string;
  ssd: string;
  mess_stn: string;
  section: string;
  remarks: string;
}

export interface BackendSailingAssignmentsResponse {
  sailing_id: number;
  sailing_name: string;
  sailing_status: string;
  personnel: BackendAssignmentRow[];
}

export interface BackendSailingPersonnelSummary {
  id: number;
  sailing: number;
  pno_snapshot: string;
}

export interface BackendStationMaster {
  id: number;
  name: string;
}

/** Matches `PersonnelStatusRowSerializer` exactly (verified against a live
 * `GET personnel-status/` response) — note `personal_number` (not `personnel_number`) and the
 * plain `department`/`status` keys the serializer renames its `__`-lookup fields to. */
export interface BackendPersonnelStatusRow {
  id: number;
  rank: string | null;
  firstname: string;
  lastname: string;
  personal_number: string;
  department: string | null;
  designation: string | null;
  status: string;
}

export interface BackendPersonnelStatusListResponse {
  data: BackendPersonnelStatusRow[];
}

/** `GET sailings/{id}/available_personnel/` — `SailingViewSet.available_personnel` blends
 * ship's-company personnel (`source: "personnel"`, keyed by `profile_id`) and civilians
 * (`source: "civilian"`, keyed by `civilian_id`) into one list, already excluding whoever is
 * already on the sailing. The "Add Personnel — Ship's Company" modal only wants the former —
 * civilians/embarked officers have their own separate Add flows. */
export interface BackendAvailablePersonnelRow {
  source: "personnel" | "civilian";
  profile_id?: number;
  civilian_id?: number;
  rank: string;
  name: string;
  pno: string;
  dept: string;
  desig: string;
  status: string;
}

export interface BackendAvailablePersonnelResponse {
  available: BackendAvailablePersonnelRow[];
}

/** `GET personnel-status/counts/` — a distinct endpoint, not a `?counts=true` query param on
 * the plain list. */
export interface BackendPersonnelStatusCountsResponse {
  date: string;
  total: number;
  present: number;
  on_leave: number;
  ty_duty: number;
}

/** `GET watchbill/dashboard/` — a single hand-built dict combining personnel counts,
 * per-department strength and the active-sailings list for the WSB dashboard tab. */
export interface BackendWatchbillDashboard {
  total: number;
  present: number;
  absent: number;
  active_sailings_count: number;
  completed_sailings_count: number;
  dept_strength: { dept: string; total: number; present: number; absent: number }[];
  active_sailings: {
    id: number;
    name: string;
    area: string;
    start_date: string | null;
    end_date: string | null;
    co_name: string;
    created_at: string;
  }[];
}
