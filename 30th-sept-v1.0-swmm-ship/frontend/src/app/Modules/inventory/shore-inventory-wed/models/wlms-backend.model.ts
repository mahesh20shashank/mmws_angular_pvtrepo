/**
 * Raw wire-shape DTOs returned by `backend/wlms` (see `backend/wlms/serializers.py` /
 * `backend/wlms/views.py`). snake_case, FK fields are plain numeric ids unless noted.
 * The service adapts these into the camelCase UI models in `wed.model.ts`.
 */

export interface BackendWlmsSyncResponse {
  status: "success" | "warning";
  message: string;
  updated: number;
  created: number;
  counts: { survey: number; pts: number; demand: number; iif: number };
}

export interface BackendWedExternalSyncResponse {
  status: "success" | "warning";
  message: string;
  created: number;
  updated: number;
}

export interface BackendWlmsEquipment {
  id: number;
  eqpt_id: string | null;
  eqpt_name: string | null;
  remarks: string | null;
  is_active: boolean;
  control_cell_id: string | null;
  sco_id: string | null;
  depot_id: string | null;
  created_by: string | null;
  created_date: string | null;
  updated_by: string | null;
  updated_date: string | null;
}

export interface BackendWlmsSpare {
  id: number;
  wlms_inventory: string | null;
  item_code: string | null;
  item_desc: string | null;
  category: string | null;
  eqpt: number | null;
  denom_id: string | null;
  denomination: number | null;
  sh_name: string | null;
  latest_qty: number | null;
  is_active: boolean;
  typeofspare: string | null;
}

export interface BackendWlmsDashboard {
  equipment: number;
  active_spares: number;
  available_quantity: number;
  pending_surveys: number;
  pending_pts: number;
  pending_demands: number;
  pending_iif: number;
}

/** Common base fields shared by Survey/PTS/Demand workflow entries
 * (`ApprovalWorkflowMixin`-backed models). */
export interface BackendWorkflowEntryBase {
  id: number;
  user_id: number;
  wed_spares_id: number | null;
  obs_spare_id: number | null;
  wed_routine_plan: number | null;
  wed_dart: number | null;
  spare_cart_name: string;
  is_save?: boolean;
  is_hod: boolean;
  is_approval: boolean;
  is_sync: boolean;
  sync_date: string | null;
}

export interface BackendSurveyEntry extends BackendWorkflowEntryBase {
  is_survey: boolean;
  wlms_status: string | null;
  wlms_survey_status: string;
}

export interface BackendPtsEntry extends BackendWorkflowEntryBase {
  survey_no: string | null;
  PTS_demand_no: string | null;
  demand_no: string | null;
  demand_qty: string | null;
  remarks: string | null;
  is_pts: boolean;
  is_rejected: boolean;
  wlms_pts_status: string;
  wed_demandno: string | null;
}

export interface BackendDemandEntry extends BackendWorkflowEntryBase {
  survey_no: string | null;
  PTS_no: string | null;
  demand_no: string | null;
  demand_qty: string | null;
  remarks: string | null;
  is_demand: boolean;
  is_rejected: boolean;
  is_delete: boolean;
  demand_pdf: string | null;
  wlms_demand_status: string;
  wed_demandno: string | null;
}

/** Extra annotated fields `_pending_annotated_entries`/`_serialize_pending` attach on top of
 * the base serializer fields for `*_pending_list` responses (survey/pts/demand "to do" queues). */
export interface BackendPendingAnnotations {
  scrap_qty: number | string;
  equipment_nomenclature: string;
  dart_number: string;
  dart_description: string;
  equipment_class: string;
}

export type BackendPendingSurvey = BackendSurveyEntry & BackendPendingAnnotations;
export type BackendPendingPts = BackendPtsEntry & BackendPendingAnnotations;
export type BackendPendingDemand = BackendDemandEntry & BackendPendingAnnotations;

export interface BackendSurveyPendingListResponse {
  pending_surveys: BackendPendingSurvey[];
  completed_surveys: BackendSurveyEntry[];
}

export interface BackendPtsPendingListResponse {
  pending_pts: BackendPendingPts[];
  completed_pts: BackendPtsEntry[];
}

export interface BackendDemandPendingListResponse {
  pending_demands: BackendPendingDemand[];
}

/** Extra annotated fields `PTSDemandDetailsViewSet.raised_survey_pending`
 * (`pts-demands/raised-survey-pending/`) attaches — a distinct annotation set from
 * `BackendPendingAnnotations` above (no `scrap_qty`; `demand_qty_resolved`/`receipt_status`/
 * `received_qty` instead), wrapped in `{data: [...]}` rather than a bare array. */
export interface BackendRaisedSurveyPendingAnnotations {
  demand_qty_resolved: number | string;
  receipt_status: string;
  received_qty: number | string;
  equipment_nomenclature: string;
  dart_number: string;
  dart_description: string;
  equipment_class: string;
}

export type BackendRaisedSurveyPendingRow = BackendPtsEntry & BackendRaisedSurveyPendingAnnotations;

export interface BackendRaisedSurveyPendingResponse {
  data: BackendRaisedSurveyPendingRow[];
}

export interface BackendReceiveDemand {
  id: number;
  demand_details: number | null;
  pts_details: number | null;
  demand_number: string | null;
  demand_date: string | null;
  demand_quantity: number;
  original_demand_qty: number | null;
  demand_status: string | null;
  swmm_demandno: string | null;
  dart_no: string | null;
  created_at: string;
  updated_at: string;
  gate_pass_no: string | null;
  gate_pass_date: string | null;
  received_qty: number | null;
  received_date: string | null;
}

export interface BackendWedIif {
  id: number;
  user_id: number;
  spare_id: number | null;
  is_sync: boolean;
  is_hod: boolean;
  is_approval: boolean;
  sync_response: boolean;
  is_delete: boolean;
  sync_date: string | null;
  wlms_iif_status: string;
}

/** Extra fields `wlms_combined_outbox` attaches to every row it merges in, regardless of
 * originating model — `spare_cart_name` is the one field that tells you which workflow (and
 * therefore which backend table / which mark-synced endpoint) a given row's `id` belongs to. */
export interface BackendCombinedOutboxExtra {
  dart_number: string;
  equipment_name: string;
  routine_description: string;
  equipment_nomenclature: string;
  quantity_required: number | string;
  item_serial_no: string;
  spare_cart_name: "Survey" | "PTS" | "Demand" | "IIF" | string;
}

export type BackendCombinedOutboxEntry = { id: number } & Partial<BackendWorkflowEntryBase> &
  Partial<BackendWedIif> &
  BackendCombinedOutboxExtra;

export interface BackendCombinedOutboxResponse {
  pts_entries: BackendCombinedOutboxEntry[];
}

export interface BackendReceiveQueueDemand extends BackendDemandEntry {
  demand_no: string;
}

export interface ObsSpareLookup {
  id: number;
  pattern_number: string;
  description: string;
  category: string;
  critical: boolean;
  equipment_class: number;
}

export interface ObsEquipmentClassLookup {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------------------
// References > Masters — Ship Inventory to WED Inventory mapping
// ---------------------------------------------------------------------------------------

/** `api/insma-equipment/` — sourced from `sfd.ShipEquipment`, not a WLMS model. */
export interface BackendInsmaEquipment {
  id: number;
  name: string;
}

/** `wlmsmaster/` (`SpareDataMapSerializer`) — raw FK ids only; names are resolved client-side
 * against the already-loaded INSMA/WED equipment option lists. */
export interface BackendSpareDataMap {
  id: number;
  equipment: number | null;
  wed_equipment: number | null;
  wed_spares: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------------------
// Survey/PTS/Demand/IIF "Enter Details" forms
// ---------------------------------------------------------------------------------------

export interface BackendPtsDetailContext {
  pts: BackendPtsEntry;
  quantity: number;
  generated_pts_demand_no: string;
  items: { id: number; wed_spares_id: number | null; item_serial_no: string | null }[];
}

export interface BackendDemandDetailContext {
  demand: BackendDemandEntry;
  generated_demand_no: string;
  demand_pdf_name: string | null;
}

/** `wlmsiifdetails/<pk>/` (`pk` = the `WEDIIF` cart-row id) — auto-provisions a `WEDIIFDetails`
 * row (and its `iif_no`) on first GET/PATCH. File fields come back as URLs once uploaded. */
export interface BackendIifDetails {
  id: number;
  wed_iif: number;
  iif_no: string | null;
  comly_in_other_eqpt: string | null;
  annual_req: string | null;
  phone_no: number | null;
  Specification: string | null;
  address: string | null;
  Qty_fitted_in_eqpt: string | null;
  iif_photo: string | null;
  proposed_MSL: string | null;
  drawing_no: string | null;
  drawing_doc: string | null;
  poev_costing_rs: string | null;
  bq_amount_rs: string | null;
  bq_doc: string | null;
  ss_remarks: string | null;
}

// ---------------------------------------------------------------------------------------
// Signal Demand (OPDEM / STOREDEM / CANDEM)
// ---------------------------------------------------------------------------------------

/** `master.Ship`, via `api/v1/master/ships/` (not a `wlms` endpoint — shared master data). */
export interface BackendShip {
  id: number;
  name: string;
}

/** `WLMS/models.py::SignalDemand` via `SignalDemandSerializer` — every FK is a plain id,
 * `status`/`created_by`/`created_at`/`updated_at` are read-only (server-assigned/transitioned). */
export interface BackendSignalDemand {
  id: number;
  demand_type: "OPDEM" | "STOREDEM" | "CANDEM";
  demand_number: string;
  dtg: string;
  requesting_ship: number | null;
  receiver_ship: number | null;
  equipment: number | null;
  wed_spare: number | null;
  obs_spare: number | null;
  pts_number: string;
  demand_quantity: number;
  attachment: string | null;
  remarks: string;
  status: "REGISTERED" | "FORWARDED" | "APPROVED" | "REJECTED" | "CANCELLED";
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface BackendWedImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

/** Response envelope of `POST {equipment|spares}/import-excel/`. `import_excel` dispatches to
 * Celery when a worker is available (`status: "accepted"` + `task_status_url` to poll), otherwise
 * runs inline and returns the result fields directly — both shapes are optional here since only
 * one set is ever populated per response. A 400 (unsupported columns, row-limit, or
 * row-validation failure) carries this same shape as the HTTP error body, not a success response. */
export interface BackendWedImportEnvelope {
  status?: string;
  message?: string;
  task_id?: string;
  task_status_url?: string;
  background_fallback?: boolean;
  dry_run?: boolean;
  valid_rows?: number;
  invalid_rows?: number;
  imported?: number;
  errors?: BackendWedImportRowError[];
  /** Only present on the "unsupported columns" 400 shape. */
  headers?: string[];
  allowed_columns?: string[];
  /** Only present on the "too many rows" 400 shape. */
  file?: string[];
}

/** `swmm/task_views.py::BackgroundTaskStatusView` — generic Celery task status poll. */
export interface BackendWedImportTaskStatus {
  task_id: string;
  status: string;
  result?: BackendWedImportEnvelope;
}
