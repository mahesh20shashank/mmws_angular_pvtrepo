export type ParentInventory = "ILMS" | "WLMS";
export type RequisitionCartType = "Survey" | "PTS";

export interface RequisitionEntry {
  id: string;
  requestedFrom: string;
  patternNumber: string;
  description: string;
  equipmentClass: string;
  equipmentName: string;
  category: string;
  denomination: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  quantityRequired: number;
  availableWithMo: string;
  /** "HELD" / "NOT HELD" — same underlying held-vs-required comparison as `availableWithMo`,
   * exposed as its own field to match the legacy page's separate "Status" column. */
  status: string;
  wedInventoryType: string;
  critical: boolean;
  authority: string;
  boxNo: string;
  remarks: string;
  dartNumber?: string;
  routineName?: string;
  routineNo?: string;
  routineDescription?: string;
}

export interface SendToCartPayload {
  ids: string[];
  parentInventory: ParentInventory;
  cartType: RequisitionCartType;
  /** `pattern_number`/`description`/`quantity` for each selected row — the MO/WED
   * `bulk-create-from-obs` action resolves a catalog item by pattern number itself, so the
   * selected rows' own display data is all it needs (no separate lookup by id). Omitted by
   * callers (like `sendIifToCart`) that use a different, already-real backend action instead. */
  entries?: { id: string; patternNumber: string; description: string; quantity: number }[];
}

export interface IssueRequisitionRow {
  entryId: string;
  patternNumber: string;
  description: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  quantityIssued: number;
  dartNumber?: string;
}

export interface IssueRequisitionPayload {
  username: string;
  remarks: string;
  rows: IssueRequisitionRow[];
}
