/** Every status a DART / defect can be in across the worklist and Approval tracking. */
export type OpmDartStatus =
  | "Draft"
  | "Open"
  | "In Progress"
  | "In Progress – With FMU"
  | "In Progress – With Yard"
  | "UNSAT – Fast-tracked to Yard"
  | "Complete – Verification Required"
  | "Certificate Issued"
  | "DTNR (Refit)"
  | "Closed"
  | "Returned";

export type OpmSeverity = "OPDEF" | "OPDEF (STA)" | "Normal Defect";

/** A DART / defect row in the Actions worklist. */
export interface OpmDartRow {
  /** "DART-2026-0142", or "—" for a still-draft record with no DART number yet. */
  dart: string;
  /** Equipment / service name. */
  item: string;
  reason: string;
  rect: "Yes" | "No";
  status: OpmDartStatus;
  date: string;
  sev: OpmSeverity;
  /** Whether this row can be selected into a Raise RA batch (drafts can't). */
  eligible: boolean;
}

/** An Approval / RA Status row, extended with the optional per-status detail fields
 * consumed by the Approval Detail sub-views (Verify SAT/UNSAT, Certificate, DTNR). */
export interface OpmApprovalRow {
  id: string;
  item: string;
  type: string;
  submittedBy: string;
  date: string;
  status: OpmDartStatus;
  authority: string;
  remarks: string;
  /** Verify sub-view: agency that reported the repair complete. */
  agency?: string;
  /** Certificate sub-view. */
  certType?: string;
  certMeaning?: string;
  certDate?: string;
  certAuth?: string;
  /** DTNR sub-view. */
  deferOutcome?: string;
  deferDate?: string;
  refitRef?: string;
}

export type OpmActivityKind = "Defect" | "Service" | "RA";

/** A Recent Activity row — a user's own in-flight or recently-completed transaction. */
export interface OpmActivityRow {
  kind: OpmActivityKind;
  title: string;
  code: string;
  reason: string;
  rect: string;
  status: string;
  when: string;
  by: string;
  resumable: boolean;
  note?: string;
}

/** An unmapped-spare row shown in the Add Spares picker. */
export interface OpmSpareRow {
  pattern: string;
  desc: string;
  qtyIssued: string;
  qtyHeld: string;
  denom: string;
  issueDate: string;
  issuedTo: string;
  invType: string;
  crp: string;
  authority: string;
}

export interface OpmMultipleDraftRow {
  id: string;
  draftName: string;
  rows: number;
  createdBy: string;
  lastUpdatedBy: string;
  lastUpdated: string;
  status: "Draft" | "Submitted";
}

/** A spare already mapped to the current transaction (a saved subset of `OpmSpareRow`). */
export interface OpmSavedSpare {
  pattern: string;
  desc: string;
  qtyIssued: string;
  issuedTo: string;
  authority: string;
}

/** One of the 4 reasons driving the Add Defect/DART form — the shape Overview's Quick
 * Actions dropdown already depends on (`value`/`desc`/`color`), kept stable here. */
export interface OpmDartReason {
  value: string;
  desc: string;
  color: string;
}

/** One of the 5 Raise RA type cards. */
export interface OpmRaType {
  key: string;
  desc: string;
}

/** One step of the Add/Extend Guarantee approval chain. */
export interface OpmGuaranteeStep {
  role: string;
  act: string;
  icon: string;
}

export interface OpmEquipmentHistoryStat {
  value: string;
  label: string;
  color?: string;
}

export interface OpmEquipmentHistorySection {
  title: string;
  rows: { label: string; value: string }[];
}

export type OpmGuidanceGroup = "personal" | "fleet" | "support";

export interface OpmGuidanceItem {
  icon: string;
  color: string;
  label: string;
  value: string;
  group: OpmGuidanceGroup;
}

/** Payload for the Digital Defect Book submit (`opm-actions-api.service.ts#submitDdb`). */
export interface OpmDdbSubmitPayload {
  reason: string;
  isEditing: boolean;
  editItem: string;
  baseValues: Record<string, string>;
  rectified: "Yes" | "No" | "";
  closureValues: Record<string, string>;
  raiseDartValues: Record<string, string>;
  guaranteeDefect: "Yes" | "No" | "";
  gdValues: Record<string, string>;
  spares: OpmSavedSpare[];
  trial: { agency: string } | null;
}

export interface OpmRaiseRaPayload {
  raType: string;
  darts: string[];
  fieldValues: Record<string, string>;
}

export interface OpmGuaranteeSubmitPayload {
  fieldValues: Record<string, string>;
}

export interface OpmVerifySatPayload {
  /** The DART/RA reference of the `OpmApprovalRow` being verified. */
  requestId: string;
  closedBy: string;
  personnelNo: string;
  closureRemarks: string;
}

export interface OpmVerifyUnsatPayload {
  /** The DART/RA reference of the `OpmApprovalRow` being verified. */
  requestId: string;
  remarks: string;
}

export interface OpmApprovalResubmitPayload {
  requestId: string;
  fieldValues: Record<string, string>;
  correctionNote: string;
}
