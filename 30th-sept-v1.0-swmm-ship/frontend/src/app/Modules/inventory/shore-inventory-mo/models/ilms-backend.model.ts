/**
 * Raw wire-shape DTOs returned by `backend/ilms` (see `backend/ilms/serializers.py` /
 * `backend/ilms/views.py`). snake_case, FK fields are plain ids unless noted. The service adapts
 * these into the camelCase UI models in `../models/mo.model.ts`.
 */

export interface BackendIlmsSyncResponse {
  status: "success" | "warning";
  message: string;
  updated: number;
  count: number;
}

/** `MoMappingTableSerializer` (`ilms/serializers.py`) — id-only, no nested vendor/item/equipment
 * detail; the frontend joins these against `getVendors()`/`getItems()`/`getShipEquipmentOptions()`
 * client-side. `ilms_spare_id`/`vendor_id` are the FK's primary key values directly (`Item.item_code`
 * and `Vendor.vendor_code` are both `primary_key=True` CharFields, not surrogate ids). */
export interface BackendMoMapping {
  id: number;
  ilms_spare_id: string | null;
  vendor_id: string | null;
  equipment: number | null;
}

/** `sfd.transaction-equipment/list/`'s response shape — reused by `getShipEquipmentOptions()`
 * (same endpoint `ObsApiService.getShipEquipmentOptions()` already uses for the OBS module's
 * equivalent "INSMA Equipment Name" picker in References > Masters > Spare Data Map). */
export interface BackendSfdTransactionEquipmentListResponse {
  status: string;
  equipments: { id: number; nomenclature: string }[];
}

/** `vendor-search-list/` actually routes to `VendorViewSet.search_table` (`ilms/urls.py`), NOT the
 * bare `search_list` action its name implies — that action exists in `views.py` but has no URL of
 * its own. `search_table` hand-builds each row (not `VendorSerializer`), wraps the array in a
 * `{status, data}` envelope, defaults every blank field to the literal string `"-"`, and uses its
 * own field names distinct from the `Vendor` model's (`vendor_name` not `name`, `add_line1/2/3` not
 * `address_line1/2/3`, `pincode` not `pin_code`, `country_cd` not `country_code`, `date_approved`/
 * `date_banupto` not `datetime_approved`/`date_banned_upto`) — and it never includes `pan` at all.
 * `getVendors()` previously typed/mapped this as a bare array of raw model field names, which
 * doesn't match what the endpoint actually returns at runtime. */
export interface BackendVendorSearchRow {
  ser: number;
  vendor_code: string;
  vendor_name: string;
  vendor_class: string;
  addressee: string;
  approved_by: string;
  date_approved: string;
  date_banupto: string;
  city: string;
  state: string;
  add_line1: string;
  add_line2: string;
  add_line3: string;
  pincode: string;
  country_cd: string;
  remarks: string;
  gst_no: string;
}

export interface BackendVendorSearchResponse {
  status: string;
  data: BackendVendorSearchRow[];
}

export interface BackendItemStation {
  station_code: string;
  sh_no: string;
  available: boolean;
  datetime_added: string | null;
}

export interface BackendItem {
  item_code: string;
  section_head: string | null;
  item_desc: string | null;
  country_code: string | null;
  item_deno: string | null;
  months_shelf_life: number | null;
  crp_category: string | null;
  ved_category: string | null;
  abc_category: string | null;
  incat_yn: boolean;
  // Only present on `item_search/` (search_enriched), not on `item-search-list/` (search_list).
  stations?: BackendItemStation[];
  equipment_code?: string | null;
  equipment_id?: number | null;
  nomenclature?: string | null;
}

export interface BackendItemSearchResponse {
  items: BackendItem[];
  routine_list: unknown[];
}

export interface BackendIlmsDashboard {
  items: number;
  vendors: number;
  mapped_items: number;
  pending_surveys: number;
  pending_pts: number;
  pending_demands: number;
  hod_inbox: number;
  approved_actions: number;
  pending_iif: number;
}

/** Common base fields shared by Survey/PTS/Demand workflow entries
 * (`ApprovalWorkflowMixin`-backed models). */
export interface BackendWorkflowEntryBase {
  id: number;
  custom_user: number;
  vendor_id: number | null;
  ilms_spare_id: string | null;
  obs_spare_id: number | null;
  mo_routine_plan: number | null;
  mo_dart: number | null;
  in_progress_status: string;
  is_sync: boolean;
  is_hod: boolean;
  is_hod_approval: boolean;
}

export interface BackendSurveyEntry extends BackendWorkflowEntryBase {
  demand_number: string;
  is_survey: boolean;
  mo_survey_status: string;
}

export interface BackendPtsEntry extends BackendWorkflowEntryBase {
  pts_number: string;
  is_pts: boolean;
  mo_pts_status: string;
}

export interface BackendDemandEntry extends BackendWorkflowEntryBase {
  demand_number: string;
  is_demand: boolean;
  mo_status: string;
}

/** Extra display fields `pending_list`/`ilms_combined_inbox` splice onto each serialized row —
 * not part of the declared serializer `fields`, so only present on those two actions. `"—"` is
 * the backend's own sentinel for "not resolvable". */
export interface BackendWorkflowDisplayFields {
  dart_number: string;
  equipment_name: string;
  equipment_nomenclature: string;
  dart_description: string;
  quantity_required: number | string;
  equipment_class: string;
}

export type BackendPendingSurvey = BackendSurveyEntry & BackendWorkflowDisplayFields;
export type BackendPendingPts = BackendPtsEntry & BackendWorkflowDisplayFields;
export type BackendPendingDemand = BackendDemandEntry & BackendWorkflowDisplayFields;

export interface BackendIif {
  id: number;
  spare_id: number | null;
  is_sync: boolean;
  sync_response: boolean;
  is_delete: boolean;
}

/** `GET/PATCH ilms/iif/<pk>/` (`IIFViewSet`, a plain `ModelViewSet` — no get-or-create step like
 * WLMS's `WEDIIFDetailsViewSet`, since ILMS keeps every IIF field on the one `IIF` model instead
 * of splitting cart data from a separate details row). Every field below is a plain, optional
 * `CharField` on the backend (`ilms/models.py::IIF`) except `price_date` (`DateField`) and the
 * three workflow booleans — none are required server-side, so the edit form mirrors that. */
export interface BackendIifDetail {
  id: number;
  swmm_iifno: string | null;
  in_progress_status: string;
  phone_number: string | null;
  addressee: string | null;
  state: string | null;
  email_id: string | null;
  pan_number: string | null;
  gst_number: string | null;
  fax: string | null;
  NCAGE_code: string | null;
  year_introduced: string | null;
  function_anticipated: string | null;
  ACL_anticipated: string | null;
  NSN_inventory_type: string | null;
  classification_of_item: string | null;
  shelf_life: string | null;
  price_ref: string | null;
  price_date: string | null;
  currency_code: string | null;
  price_cc: string | null;
  qty: string | null;
  eask_book_ref: string | null;
  qty_war_reserve: string | null;
  qty_constituent: string | null;
  qty_range_scale: string | null;
  qty_ship_fit: string | null;
  qty_present: string | null;
  immediate_usage: string | null;
  end_usage: string | null;
  olditem_code: string | null;
  is_sync: boolean;
  is_hod: boolean;
  is_hod_approval: boolean;
  mo_status: string;
  is_delete: boolean;
}

/** Editable subset of `BackendIifDetail` — every field the "Edit IIF Details" form (`PATCH
 * ilms/iif/<pk>/`) may write. Excludes ids, workflow flags/status, and `swmm_iifno` (server-
 * assigned at HOD-send time, see `IIFViewSet.bulk_send_for_approval`). */
export type IifDetailUpdatePayload = Partial<
  Pick<
    BackendIifDetail,
    | "phone_number"
    | "addressee"
    | "state"
    | "email_id"
    | "pan_number"
    | "gst_number"
    | "fax"
    | "NCAGE_code"
    | "year_introduced"
    | "function_anticipated"
    | "ACL_anticipated"
    | "NSN_inventory_type"
    | "classification_of_item"
    | "shelf_life"
    | "price_ref"
    | "price_date"
    | "currency_code"
    | "price_cc"
    | "qty"
    | "eask_book_ref"
    | "qty_war_reserve"
    | "qty_constituent"
    | "qty_range_scale"
    | "qty_ship_fit"
    | "qty_present"
    | "immediate_usage"
    | "end_usage"
    | "olditem_code"
  >
>;

export interface BackendReceiveRow {
  source: "Demand" | "Survey";
  mo_item_code: string;
  item_description: string;
  crp_category: string;
  denomination: string;
  dart_number: string;
  demand_qty: number | string;
  survey_number: string;
  qty_issued_by_mo: number | string;
  demand_number: string;
  in_progress_status: string;
}

export interface BackendMergedReceiveListResponse {
  entries: BackendReceiveRow[];
  inventory_type: string;
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

/** One failed row from `ExcelImportExportMixin.import_excel` (`ilms/excel.py`) — `errors` keys
 * are the serializer field names that failed for that row. */
export interface BackendMoImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

/** Response envelope of `POST {item|vendor}/import-excel/`. `import_excel` dispatches to Celery
 * when a worker is available (`status: "accepted"` + `task_status_url` to poll), otherwise runs
 * inline and returns the result fields directly — both shapes are optional here since only one
 * set is ever populated per response. A 400 (unsupported columns, row-limit, or row-validation
 * failure) carries this same shape as the HTTP error body, not a success response. */
export interface BackendMoImportEnvelope {
  status?: string;
  message?: string;
  task_id?: string;
  task_status_url?: string;
  background_fallback?: boolean;
  dry_run?: boolean;
  valid_rows?: number;
  invalid_rows?: number;
  imported?: number;
  errors?: BackendMoImportRowError[];
  /** Only present on the "unsupported columns" 400 shape. */
  headers?: string[];
  allowed_columns?: string[];
  /** Only present on the "too many rows" 400 shape. */
  file?: string[];
}

/** `swmm/task_views.py::BackgroundTaskStatusView` — generic Celery task status poll. */
export interface BackendMoImportTaskStatus {
  task_id: string;
  status: string;
  result?: BackendMoImportEnvelope;
}
