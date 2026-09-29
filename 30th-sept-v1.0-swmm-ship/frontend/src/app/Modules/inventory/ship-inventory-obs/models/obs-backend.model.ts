/**
 * Raw wire-shape DTOs returned by `backend/obs` (see `backend/obs/serializers.py` /
 * `backend/obs/views.py`). snake_case, FK fields are plain numeric ids unless noted.
 * The service adapts these into the camelCase UI models in `spare.model.ts` and friends.
 */

export interface BackendLookup {
  id: number;
  name: string;
  /** What a dropdown SHOWS, when it differs from `name`.
   *
   * Only the two department lists send it, and only when the row's own name is not the
   * canonical department name — a CMMS-synced deployment names its Engineering row `E`, and
   * the label then reads `E | ENGINEERING` so the operator can see which department the
   * application has understood the row to be. Optional because every other lookup omits it,
   * and `name` remains what the rest of the app keys and reports on. */
  label?: string;
  /** The canonical department name the back end resolved this row to. Departments only. */
  canonical_name?: string;
}

export interface BackendSpareClass extends BackendLookup {
  department: number | null;
}

export interface BackendMasterDropdown {
  departments: BackendLookup[];
  /** Department-scoped to the caller (`SparesViewSet.master_dropdown`). Not currently read by
   * this service — Issue Spare's "Sub-Department" dropdown is sourced from SFD's real
   * Ship-Owned Sub-Departments master instead (`BackendSfdListResponse` below), not this `ems`
   * one — kept here only because it's genuinely part of `master/`'s real response shape. */
  sections: BackendLookup[];
}

/** `GET api/v1/sfd/list/` (`sfd_list()`), optionally `?sub_dep=<id>` to filter `equipments`.
 * `metadata.sub_departments` is always department-scoped to the caller server-side, independent
 * of the `sub_dep` filter — this is the real "Ship-Owned Sub-Departments" master (Ship
 * Configuration > Configuration), not `ems`'s SectionName. */
export interface BackendSfdEquipmentRow {
  id: number;
  nomenclature: string;
}

export interface BackendSfdListResponse {
  equipments: BackendSfdEquipmentRow[];
  metadata: {
    sub_departments: BackendLookup[];
  };
}

/** `GET api/v1/sfd/sfd-list/` (`SFDTransactionViewSet`/`SourceShipEquipmentSerializer`) — the
 * real "Active Systems & Equipment" list (Ship Configuration > SFD Details), paginated. Unlike
 * `sfd/list/` above, this is NOT dependent on `sub_department_f_key` being populated — it shows
 * every active `ShipEquipment` row for the ship unconditionally, with `sub_dept` as an optional
 * narrowing filter only (matches the reference screen's own behavior, where "Sub Dept" renders
 * "—" for equipment that has none set, rather than excluding it). */
export interface BackendSfdTransactionRow {
  equipment_ship_id: number;
  equipment_code: string | null;
  equipment_name: string | null;
  nomenclature: string | null;
}

export interface BackendSfdTransactionListResponse {
  count: number;
  results: BackendSfdTransactionRow[];
}

/** `GET api/v1/user/users/active/` — department-scoped active users, `id` is the
 * `CustomUserProfile` pk (matches `Issue.username`'s FK target). */
export interface BackendActiveUsersResponse {
  history_users: { id: number; name: string }[];
}

export interface BackendRoutineRequisitionRow {
  planned_spare_id: number;
  pattern_number: string;
  quantity_required: number;
  onboard_spare: number | null;
  description: string;
  quantity_available: number;
  available_onboard: boolean;
  routine_name: string;
  routine_no: string;
  routine_description: string;
  dart_number: string;
  wed_inventory_type: string;
}

export interface BackendDefectRequisitionRow {
  dart_spare_id: number;
  dart: number;
  dart_number: string;
  pattern_number: string;
  description: string;
  quantity_required: number;
  onboard_spare: number | null;
  quantity_available: number;
  available_onboard: boolean;
  wed_inventory_type: string;
}

export interface BackendEquipmentClass extends BackendLookup {
  spare_class: number;
}

export interface BackendDenomination extends BackendLookup {
  department: number | null;
}

export type BackendAuthority = BackendLookup;

export interface BackendSpare {
  id: number;
  equipment_class: number;
  pattern_number: string;
  description: string;
  category: string;
  critical: boolean;
  criticality_strength: string | null;
  compartment: string | null;
  location: string | null;
  rack_position: string | null;
  rack_number: string | null;
  denomination: number | null;
  quantity_authorised: number;
  quantity_available: number;
  authority: number;
  page: string | null;
  line: string | null;
  remarks: string | null;
  mo_demand_number: string | null;
  image: string | null;
  is_obs: boolean | null;
  /** `quantity_authorised - quantity_available`, annotated by
   * `SparesQuerySet.d787j_deficiencies()` (backend/obs/managers.py). Only the D787J
   * Deficiency endpoint returns it, hence optional — every other endpoint serving a
   * spare uses the plain `SparesSerializer` and omits it. */
  deficiency_quantity?: number;
}

export interface BackendSpareDetailSummary {
  success: boolean;
  data: {
    id: number;
    pattern_number: string;
    description: string;
    category: string;
    equipment_class: string;
    spare_class: string;
    department: string;
    authority: string;
    compartment: string;
    location: string;
    rack_position: string;
    rack_number: string;
    denomination: string;
    quantity_authorised: number;
    quantity_available: number;
    images: string[];
    is_critical: boolean;
  };
}

export interface BackendIssue {
  id: number;
  spare: number;
  equipment: number | null;
  date_of_issue: string;
  username: number;
  quantity_issued: number;
  issue_time: string | null;
  remarks: string;
  dart_number: string;
  /** The unit a Ty Loan went out to, as typed on Issue Spare's Ty Loan branch. Blank on an
   * internal issue — the holder is on this ship, so there is no other unit to name. */
  issued_to_unit: string;
  // Developed with Understanding: the other-unit person a Ty Loan was issued to
  // (`OtherCustomUserProfile` pk, read-only, CP-G contract section 6). Null on every Defect
  // issue and on a Ty Loan recorded before the link existed (R2 Q12).
  issued_to_other_profile: number | null;
  // Developed with Understanding: that person's D5 label, "" when no person is linked.
  issued_to_other_label: string;
  // True on an Issue row the Excel import wrote to record a shortfall -
  // a quantity the ship was authorised to hold and did not hold when its inventory was
  // initialised. Nobody was issued anything, so the Return tab must not show the account the
  // row is recorded against as the holder. `IssueSerializer` sends it read-only.
  is_import_shortfall: boolean;
}

export interface BackendIssueListEntry {
  id: number;
  issue_entry: number;
  quantity_toreturn: number;
  dart_number: string;
}

export interface BackendReturn {
  id: number;
  spare_id: number | null;
  command_id: number | null;
  ship_id: number | null;
  username: string;
  returned_by: number | null;
  remarks: string | null;
  quantity_returned: number;
  return_time: string | null;
}

/** `onboard-spares/inventory-users/` — every profile that can sign in, across departments,
 * with the label fields Ship Inventory's people-pickers show and the unit the person belongs
 * to. Every flag on this row is decided server-side because none of them can be worked out
 * from the front end:
 *  - `is_own_unit` compares against the ship recorded in masters (`master.utils.get_this_ship`).
 *  - `is_ad_user` is the personal-number-starts-with-a-digit test that separates real
 *    personnel from the accounts `seed_all.py` writes.
 *  - `selectable` is whether a picker may offer this person, and depends on the whole
 *    directory at once (while no AD user exists at all, guests stand in).
 *  - `in_scope` is the caller's own department scoping, carried as a flag rather than a
 *    filter so the same response can still name a holder from another department. */
export interface BackendObsInventoryUser {
  id: number;
  name: string;
  rank: string;
  personal_number: string;
  role: string;
  department: string;
  unit_name: string;
  // Developed with Understanding: designation text, else the designation master name, else ""
  // (CP-G contract sections 1 and 2).
  designation: string;
  is_own_unit: boolean;
  is_ad_user: boolean;
  selectable: boolean;
  in_scope: boolean;
  selectable_for_issue: boolean;
}

export interface BackendObsInventoryUsersResponse {
  own_unit_name: string;
  users: BackendObsInventoryUser[];
}

// Developed with Understanding: one row of `GET returns/other-unit-users/` - a current other-unit
// person for the Ty Loan Issued To field (CP-G contract section 3). `role` is always "GUEST".
export interface BackendOtherUnitUser {
  id: number;
  name: string;
  personal_number: string;
  rank: string;
  unit_name: string;
  unit_code: string;
  command_code: string;
  command_name: string;
  designation: string;
  role: string;
  is_own_unit: boolean;
  selectable_for_issue: boolean;
}

// Developed with Understanding: DRF page envelope of `GET returns/other-unit-users/`.
export interface BackendOtherUnitUsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: BackendOtherUnitUser[];
}

// Developed with Understanding: one Command or Unit Name option of
// `GET returns/other-unit-users/filters/` (CP-G contract section 4).
export interface BackendOtherUnitFilterOption {
  code: string;
  name: string;
  count: number;
}

// Developed with Understanding: `GET returns/other-unit-users/filters/` - `units` is narrowed by
// `?command=` when one is given.
export interface BackendOtherUnitUserFiltersResponse {
  commands: BackendOtherUnitFilterOption[];
  units: BackendOtherUnitFilterOption[];
}

export interface BackendTyLoanPair {
  issue: BackendIssue;
  return: BackendReturn | null;
}

// `awaiting_incatting` is the IIF gate, and it is NOT `is_iif`.
//
// It is true when an `obs_notincatteditem` row exists for this queue row's spare with
// `incatted_status` and `is_deleted` both false — that is, the spare has an unresolved
// Due-for-IIF record right now. The back end computes it per request as an `Exists()`
// subquery and never stores it, so it is read-only and always present on both payloads.
//
// `is_iif` sits beside it, unchanged, and means something different: this queue row was
// created by an import shortfall on a SWMM-generated pattern number. It is set on that one
// path only, so a spare that IS an IIF item but was issued through the ordinary issue screen
// carries `is_iif: false` while its IIF record sits open. That is exactly why the gate reads
// the record and not the flag. `is_iif_sync` is written by nothing and read by nothing.
export interface BackendSurvey {
  id: number;
  issue_entry: number | null;
  spare: number;
  quantity_tosurvey: number;
  dart_number: string | null;
  // The DART number the row should actually SHOW, and it is not always `dart_number`.
  // `SurveySerializer.get_initiate_dart_number` returns the row's own number when it carries a
  // real one, and otherwise resolves the DART actually raised against this spare's pattern
  // number through `DartSpare`, falling back to the literal string "pending" when there is
  // none. So it is correct in both cases where `dart_number` is correct in only one - a row
  // whose DART was raised through the maintainer's own defect form carries a blank
  // `dart_number` until that form's pattern-match update reaches it.
  //
  // It is a `SerializerMethodField`, emitted on every row of both the list and the detail
  // payload, so it is declared non-optional. `null` is reachable because `InitiateDart
  // .dart_number` is itself nullable.
  initiate_dart_number: string | null;
  is_iif: boolean;
  is_iif_sync: boolean;
  awaiting_incatting: boolean;
}

export interface BackendDemand {
  id: number;
  issue_entry: number | null;
  spare: number;
  quantity_todemand: number;
  survey_entry: number | null;
  dart_number: string | null;
  // The Due for Demand half of the same resolved DART number — see BackendSurvey.
  // `DemandSerializer.get_initiate_dart_number` resolves it identically.
  initiate_dart_number: string | null;
  is_iif: boolean;
  is_iif_sync: boolean;
  // The Due for Demand half of the same gate flag — see BackendSurvey.
  awaiting_incatting: boolean;
}

export interface BackendNotInCattedItem {
  id: number;
  spare_id: number | null;
  incatted_status: boolean;
  is_deleted: boolean;
}

export interface BackendVerifyPatternResult {
  valid: boolean;
  source?: string;
  pattern_number: string;
  item_code?: string;
  description?: string;
  item_desc?: string;
  category?: string;
  crp_category?: string;
  expected_category?: string;
  category_mismatch?: boolean;
  denomination?: string;
  error?: string;
}

export interface BackendMultiIssueResult {
  status: string;
  issued: string[];
  errors: { pattern_number: string; error: string }[];
  dart_number: string;
  issues: BackendIssue[];
  // present on `multi_issue_spare/` only when the issue raised a spare's
  // Criticality Strength, and absent otherwise. `feedbackInterceptor` reads it off the raw body
  // and raises the toast, so no component consumes this property - it is declared to document
  // the response shape, which is why it is optional.
  message?: string;
}

/** Master lookup maps built once from the four master-data endpoints and reused
 * to join names onto the id-only fields returned by the Spares/transaction endpoints. */
export interface ObsMasterMaps {
  spareClassNameById: Map<number, string>;
  equipmentClassById: Map<number, { name: string; spareClassId: number }>;
  denominationNameById: Map<number, string>;
  authorityNameById: Map<number, string>;
  /** Built for free from `rawSpareClasses$` (already fetched) — lets `adaptSpare()`
   * derive a spare's department without an extra request. */
  departmentIdBySpareClassId: Map<number, number | null>;
  /** From `master/`'s `departments` list — lets `adaptSpare()` resolve the department
   * name for display (e.g. the Add Existing Spare detail band) alongside its id. */
  departmentNameById: Map<number, string>;
}

export interface BackendVendorPilImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

/** Response envelope of `POST vendor-pils/import-excel/` (`ilms.VendorPilViewSet`, mixed with
 * `ExcelImportExportMixin`). Dispatches to Celery when a worker is available (`status:
 * "accepted"` + `task_status_url` to poll), otherwise runs inline and returns the result fields
 * directly — both shapes are optional here since only one set is ever populated per response. A
 * 400 (unsupported columns, row-limit, or row-validation failure) carries this same shape as the
 * HTTP error body, not a success response. */
export interface BackendVendorPilImportEnvelope {
  status?: string;
  message?: string;
  task_id?: string;
  task_status_url?: string;
  background_fallback?: boolean;
  dry_run?: boolean;
  valid_rows?: number;
  invalid_rows?: number;
  imported?: number;
  errors?: BackendVendorPilImportRowError[];
  /** Only present on the "unsupported columns" 400 shape. */
  headers?: string[];
  allowed_columns?: string[];
  /** Only present on the "too many rows" 400 shape. */
  file?: string[];
}

/** `swmm/task_views.py::BackgroundTaskStatusView` — generic Celery task status poll. */
export interface BackendVendorPilImportTaskStatus {
  task_id: string;
  status: string;
  result?: BackendVendorPilImportEnvelope;
}
