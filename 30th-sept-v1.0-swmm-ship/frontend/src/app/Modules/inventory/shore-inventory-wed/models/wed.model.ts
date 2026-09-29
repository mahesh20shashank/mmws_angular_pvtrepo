export interface DropdownOptionDto {
  label: string;
  value: string;
}

export interface WedItem {
  equipmentName: string;
  patternNo: string;
  itemDescription: string;
  denomination: string;
  itemCategory: string;
  inventoryType: string;
}

export interface WedDashboardCounts {
  surveyInProgress: number;
  demandInProgress: number;
  ptsDemandInProgress: number;
  outstandingDemands: number;
  iifInProgress: number;
  ptsRioSurveyPending: number;
}

/**
 * Shared shape for the 6 "Spares Transaction Cart" list pages (Survey, PTS,
 * Demand, Receive, IIF, PTS/RIO Survey-Pending). Each Django source template
 * has a slightly different column set — rather than 6 near-duplicate
 * interfaces, each list page's ColDef[] just picks the fields it needs.
 */
export interface WedCartEntry {
  id: string;
  syncStatus: "Synced" | "Not Synced";
  itemCode: string;
  itemDescription: string;
  denomination?: string;
  qty?: number;
  category?: string;
  hodApprovalStatus?: "Approved" | "Pending";
  /** Whether the row's "Enter Survey/PTS/Demand Details" form has been completed (`is_save`) —
   * drives `CartList`'s per-row action label (Enter Details vs Edit). Not applicable to Receive
   * (no such flag) or IIF (always editable in the reference, no gate). */
  isSave?: boolean;
  /** Receive cart only — which workflow this outstanding receipt line originated from
   * (`ReceiveDemandDetails.demand_details` vs `.pts_details`, exactly one set), needed to submit
   * "Enter Receipt Details" against the correct FK. */
  receiveSourceKind?: "demand" | "pts";
  /** Receive cart only — the `DemandDetails`/`PTSDemandDetails` id itself (`row.demand_details` /
   * `row.pts_details`) — distinct from `id` above, which is the `ReceiveDemandDetails` row's own
   * pk. `createReceipt()` must reference the source id, not the receive-queue row's id. */
  receiveSourceId?: number;
  dartNo?: string;
  demandNo?: string;
  surveyNo?: string;
  demandType?: string;
  issueStatus?: string;
  vettingRemarks?: string;
  receivedQty?: number;
  wedIssueQty?: number;
  receiptStatus?: string;
  equipmentNomenclature?: string;
  incattingStatus?: string;
  equipmentClass?: string;
  swmmPatternNo?: string;
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
  itemCode: string;
  itemDescription: string;
  category: string;
  surveyNo: string;
  surveyDate: string;
  demandNo: string;
  demandedQty: number;
  demandDate: string;
  wedIssuedQty: number;
  gatePassNo: string;
  dartNo: string;
  equipmentClass: string;
  equipmentNomenclature: string;
}

export interface RioHistoryEntry {
  id: string;
  rioType: string;
  itemCode: string;
  itemDescription: string;
  rioDemandNo: string;
  demandDate: string;
  dtg: string;
  year: string;
  dartNo: string;
  qtyDemanded: number;
  wedIssueQty: number;
  onboardReceiptDate: string;
  gatePassNo: string;
  equipmentClass: string;
}

export type SignalDemandType = "OPDEM" | "STOREDEM" | "CANDEM";
export type SignalDemandStatus = "REGISTERED" | "FORWARDED" | "APPROVED" | "REJECTED" | "CANCELLED";

/** `WLMS/models.py::SignalDemand` — no expanded FK names come back from the serializer (every
 * FK is a plain id), so `shipName`/`requestingShipName`/`itemLabel` etc. are resolved client-side
 * against `WedApiService`'s lookup caches, same as every other WED entity. There is no routed
 * retrieve/update/delete for a single row (`backend/wlms/urls.py` only wires list/create + the
 * four status-transition actions) — this list is the only way to see one, and it can only be
 * acted on via `forward`/`approve`/`reject`/`cancel`, never edited in place. */
export interface SignalDemandEntry {
  id: string;
  demandType: SignalDemandType;
  demandNumber: string;
  dtg: string;
  requestingShipId: string;
  requestingShipName: string;
  receiverShipId: string;
  receiverShipName: string;
  itemLabel: string;
  ptsNumber: string;
  demandQuantity: number;
  remarks: string;
  status: SignalDemandStatus;
  createdAt: string;
}

export interface SignalDemandPayload {
  demandType: SignalDemandType;
  demandNumber: string;
  dtg: string;
  requestingShipId: string;
  /** Required only when `demandType === "CANDEM"`; must be omitted/cleared otherwise — the
   * backend serializer rejects a `receiver_ship` on a non-CANDEM demand. */
  receiverShipId?: string;
  /** Exactly one of `wedSpareId`/`obsSpareId` is required — `SignalDemandSerializer.validate()`
   * rejects a row carrying neither. */
  wedSpareId?: string;
  obsSpareId?: string;
  equipmentId?: string;
  ptsNumber?: string;
  demandQuantity: number;
  remarks?: string;
}

export type WedImportKind = "equipment" | "spares";

export interface WedImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

export interface WedImportResult {
  /** "imported" covers both a successful import AND a row-validation failure (imported=0 — this
   * import is all-or-nothing, so any invalid row blocks the whole file) — check
   * `invalidRows`/`errors` to tell the two apart. "column_error"/"row_limit_error" are the two
   * file-level rejection shapes the backend returns before it even looks at individual rows. */
  status: "imported" | "dry_run" | "column_error" | "row_limit_error";
  imported: number;
  validRows: number;
  invalidRows: number;
  errors: WedImportRowError[];
  /** Only populated for "column_error" (unsupported columns) / "row_limit_error" (too many rows). */
  headerErrors: string[];
  allowedColumns: string[];
}

export interface IifHistoryEntry {
  id: string;
  iifRequisitionNo: string;
  iifRequisitionDate: string;
  wlmsSyncDate: string;
  swmmItemCode: string;
  wedItemCode: string;
  incattingCompletionDate: string;
}
