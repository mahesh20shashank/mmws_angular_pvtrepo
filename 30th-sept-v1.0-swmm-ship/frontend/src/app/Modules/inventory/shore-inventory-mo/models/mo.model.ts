export interface Vendor {
  id: string;
  /** Row position in the loaded list (1-based) — the "SER" column. */
  ser: number;
  vendorCode: string;
  vendorName: string;
  vendorClass: string;
  addressee: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  state: string;
  pincode: string;
  countryCode: string;
  remarks: string;
  gstNo: string;
  pan: string;
  approvedBy: string;
  dateApproved: string;
  dateBannedUpto: string;
}

export interface MoItem {
  itemCode: string;
  itemDescription: string;
  crpCategory: string;
  denomination: string;
  shipInventoryStatus: string;
  vendorName: string;
  ilmsEquipmentDescription: string;
  equipmentCode?: string;
}

export interface MoDashboardCounts {
  surveyInProgress: number;
  demandInProgress: number;
  ptsDemandInProgress: number;
  outstandingDemands: number;
  iifInProgress: number;
  ptsRioSurveyPending: number;
}

/**
 * Shared shape for the 5 "Spares Transaction Cart" list pages (Survey, PTS,
 * Demand, Receive, PTS/RIO Survey-Pending). The Django source has a slightly
 * different column set per cart — rather than 5 near-duplicate interfaces,
 * each list page's ColDef[] just picks the fields relevant to it.
 */
export interface MoCartEntry {
  id: string;
  syncStatus: "Synced" | "Not Synced";
  itemCode: string;
  itemDescription: string;
  denomination: string;
  qty: number;
  category: string;
  hodApprovalStatus?: "Approved" | "Pending";
  /** Whether this entry has been sent for HOD approval at all (`is_hod`) — distinct from
   * `hodApprovalStatus`, which only describes where a *sent* entry sits (`is_hod_approval`). Used
   * to scope "As is Transaction > Demand Action"/"Survey" to entries actually raised for action,
   * same set the real Approval tab's inbox/outbox draws from. */
  isHod?: boolean;
  dartNo?: string;
  ilmsDemandNo?: string;
  surveyNo?: string;
  demandNo?: string;
  demandType?: string;
  moVettingRemarks?: string;
  moIssueStatus?: string;
  equipmentClass?: string;
  equipmentNomenclature?: string;
  incattingStatus?: string;
  /** BACKEND GAP: `merged-receive-list/`'s `qty_issued_by_mo` is hardcoded to `"—"` server-side
   * (`ilms/views.py` `_receive_row()`) — no model field tracks it yet, so this always reads empty
   * for now even though the column/mapping is real. */
  moIssueQty?: string;
}

export interface ApprovalEntry {
  id: string;
  spareCartName: string;
  patternNo: string;
  spareDescription: string;
  dartNo: string;
  equipmentClass: string;
  category: string;
  critical: boolean;
  qty: number;
}

export interface NormalDemandHistoryEntry {
  id: string;
  /** Row position in the loaded list (1-based), computed client-side — the "Ser" column. */
  ser: number;
  moItemCode: string;
  itemDescription: string;
  category: string;
  surveyNo: string;
  surveyDate: string;
  demandNo: string;
  demandedQty: number;
  demandDate: string;
  moIssuedQty: number;
  dartNo: string;
  equipmentClass: string;
  equipmentNomenclature: string;
  /** BACKEND GAP: no field anywhere in `ilms` app models tracks onboard receipt date/qty —
   * `mo_receive_list/` only computes a transient pending-receipt queue, not a receipt history log.
   * Always empty until a real receipt-log field/model is added server-side. */
  onboardReceiptDate: string;
  onboardReceiptQty: string;
  /** BACKEND GAP: `gate_pass_no`/`gate_pass_date` exist on the `wlms` (WED) app's models only —
   * no equivalent field exists anywhere in `ilms` (MO). Always empty until added server-side. */
  gatePassNo: string;
  gatePassDate: string;
}

/** BACKEND GAP: no RIO-specific model, field, or endpoint exists anywhere in the `ilms` app (only
 * a survey-type/OPDEM concept on `obs.PostSurvey`, but that's wired to the WED module's
 * `WedInventoryViewSet`, not MO) — `getRioDemandHistory()` always returns `[]`, so every field
 * below (including the ones added for column parity with the reference design: `dtg`, `year`,
 * `gatePassNo`, `equipmentNomenclature`) is currently unreachable, not just unpopulated. */
export interface RioHistoryEntry {
  id: string;
  ser: number;
  rioType: string;
  moItemCode: string;
  itemDescription: string;
  rioDemandNo: string;
  demandDate: string;
  dtg: string;
  year: string;
  dartNo: string;
  qtyDemanded: number;
  moIssueQty: number;
  onboardReceiptDate: string;
  gatePassNo: string;
  equipmentClass: string;
  equipmentNomenclature: string;
}

export type MoImportKind = "item" | "vendor";

export interface MoImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

export interface MoImportResult {
  /** "imported" covers both a successful import AND a row-validation failure (imported=0 —
   * ILMS's import is all-or-nothing, so any invalid row blocks the whole file) — check
   * `invalidRows`/`errors` to tell the two apart. "column_error"/"row_limit_error" are the two
   * file-level rejection shapes the backend returns before it even looks at individual rows. */
  status: "imported" | "dry_run" | "column_error" | "row_limit_error";
  imported: number;
  validRows: number;
  invalidRows: number;
  errors: MoImportRowError[];
  /** Only populated for "column_error" (unsupported columns) / "row_limit_error" (too many rows). */
  headerErrors: string[];
  allowedColumns: string[];
}

export interface IifHistoryEntry {
  id: string;
  ser: number;
  iifRequisitionNo: string;
  iifRequisitionDate: string;
  ilmsSyncDate: string;
  swmmItemCode: string;
  moItemCode: string;
  incattingCompletionDate: string;
  equipmentClass: string;
  equipmentNomenclature: string;
}
