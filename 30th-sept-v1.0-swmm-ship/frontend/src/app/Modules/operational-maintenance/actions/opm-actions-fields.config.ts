import { DynamicFieldKind, ChipTone, DynamicFieldSpec } from "../../../shared/components";
import {
  OpmActivityRow,
  OpmApprovalRow,
  OpmDartReason,
  OpmDartRow,
  OpmDartStatus,
  OpmEquipmentHistorySection,
  OpmEquipmentHistoryStat,
  OpmGuidanceItem,
  OpmGuaranteeStep,
  OpmRaType,
  OpmSeverity,
  OpmSpareRow,
} from "./opm-actions.models";

/** Turns a field's display name into a safe reactive-form control key — mirrors the
 * same helper in the sibling `sfd-actions-fields.config.ts`. */
export function controlKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

type OpmFieldKind = "select" | "auto" | "date" | "radio" | "editor" | "text" | "display" | "file";

/** Raw field-spec tuple format — one row per Digital Defect Book / RA / Guarantee
 * field, converted to a render-ready `DynamicFieldSpec` by `toDynamicFieldSpec()`. */
export interface OpmFieldSpec {
  name: string;
  kind: OpmFieldKind;
  mandatory: boolean;
  source: string;
  mandNote?: string;
  radioOptions?: string[];
}

const KIND_MAP: Record<OpmFieldKind, DynamicFieldKind> = {
  select: "select",
  auto: "auto",
  display: "auto",
  date: "date",
  radio: "radio",
  editor: "editor",
  text: "text",
  file: "file",
};

/** Ordered regex → option-list table backing `opmDemoOptions` — first match wins.
 * A plain table (rather than a chain of `if`s) keeps the lookup's cognitive
 * complexity flat regardless of how many field-name patterns it grows to. */
const DEMO_OPTION_RULES: { test: RegExp; options: string[] }[] = [
  { test: /Severity/i, options: ["OPDEF", "OPDEF (STA)", "Normal Defect"] },
  { test: /Status/i, options: ["Operational", "Partially Non Ops", "Non Ops"] },
  { test: /^Category$/i, options: ["CAT 1", "CAT 2", "CAT 3"] },
  { test: /^Place$/i, options: ["ND (Mbi)", "ND (V)"] },
  { test: /Location|Compartment/i, options: ["Machinery Space", "Aux Machinery Room", "Bridge", "Steering Gear"] },
  { test: /Department|Dept/i, options: ["Marine Eng", "Weapon Eng", "Electrical", "Aviation Support"] },
  { test: /Type$/i, options: ["Major", "Minor"] },
  { test: /System/i, options: ["Propulsion", "Radar", "Navigation", "Power Generation"] },
  { test: /Equipment Name/i, options: ["LO Pump - ME No.1", "Sea Viper Director", "440V Switchboard"] },
  { test: /Service/i, options: ["Overhaul", "Calibration", "Inspection", "Repair"] },
  { test: /Authority/i, options: ["Command HQ", "INSMA", "Dockyard"] },
  { test: /Deck/i, options: ["01", "02", "03", "04"] },
  { test: /DART Trigger/i, options: ["Trial", "OST", "Inspection", "OLSAT", "FOLSAT", "Normal Defect"] },
  { test: /Symptoms/i, options: ["Abnormal noise / vibration", "Overheating", "Leakage", "Loss of power", "Vibration / misalignment"] },
  { test: /Type of Assistance/i, options: ["Fleet Maintenance Unit", "Dockyard", "OEM Representative", "Sea Rider Team"] },
  { test: /Place of Repair/i, options: ["Naval Dockyard, Portsmouth", "Fleet Maintenance Unit", "OEM Facility"] },
];

/** Demo option-list generator for every `select` kind field — regex-keyed against the
 * field's display name, same table as the reference prototype's `opDemoOpts`. */
export function opmDemoOptions(name: string): string[] {
  return DEMO_OPTION_RULES.find((rule) => rule.test.test(name))?.options ?? ["Value A", "Value B", "Value C"];
}

function placeholderFor(spec: OpmFieldSpec): string {
  if (spec.name === "As&As Type") return "Select type — Major / Minor";
  if (spec.name === "Equipment Name") return "Select equipment name";
  switch (spec.kind) {
    case "select":
      return `Select ${spec.name}`;
    case "date":
      return "Select date";
    case "file":
      return "Attach Word / PDF / image / audio";
    case "auto":
    case "display":
      return "Auto-fetched from CMMS";
    default:
      return `Enter ${spec.name.toLowerCase()}`;
  }
}

/** Converts one raw `OpmFieldSpec` into a render-ready `DynamicFieldSpec` for
 * `<app-dynamic-field>`. The field's actual *value* lives on the `FormControl` the
 * component builds alongside this (auto-fetched values are `patchValue`d there, not
 * baked into the spec) — this function only describes how the field looks. */
export function toDynamicFieldSpec(spec: OpmFieldSpec): DynamicFieldSpec {
  const isAuto = spec.kind === "auto" || spec.kind === "display";
  return {
    key: controlKey(spec.name),
    label: spec.name,
    kind: KIND_MAP[spec.kind],
    required: spec.mandatory,
    badge: spec.source + (isAuto ? " (auto-fetched)" : ""),
    badgeTone: spec.source === "User" ? "user" : "system",
    placeholder: placeholderFor(spec),
    options: spec.kind === "select" ? opmDemoOptions(spec.name).map((o) => ({ label: o, value: o })) : undefined,
    radioOptions: spec.radioOptions,
    hint: spec.mandNote,
    minDate: spec.kind === "date" && /Future/i.test(spec.name) ? new Date().toISOString().slice(0, 10) : undefined,
    readonly: isAuto,
  };
}

// ---------------------------------------------------------------------------
// Reason cards (Add Defect / DART)
// ---------------------------------------------------------------------------

export const OPM_DART_REASONS: OpmDartReason[] = [
  { value: "As&As", desc: "Alteration & Addition — Major or Minor", color: "#A855F7" },
  { value: "ABER", desc: "CAT I / II / III — with or without As&As", color: "#F59E0B" },
  { value: "Defect", desc: "Standard defect lifecycle — rectified onboard or raise DART", color: "#F82C36" },
  { value: "Services", desc: "Dockyard service request — linked or standalone", color: "#22C55E" },
];

export const OPM_REASON_OPTIONS = OPM_DART_REASONS.map((r) => r.value);

// ---------------------------------------------------------------------------
// Digital Defect Book field sets
// ---------------------------------------------------------------------------

/** Prepended to `DDB_COMMON` only when Reason === 'As&As'. */
export const AS_AND_AS_TYPE_FIELD: OpmFieldSpec = { name: "As&As Type", kind: "select", mandatory: true, source: "User" };

export const DDB_COMMON: OpmFieldSpec[] = [
  { name: "Category", kind: "select", mandatory: true, source: "User" },
  { name: "Equipment Name", kind: "select", mandatory: true, source: "SFD", mandNote: "equipment-linked" },
  { name: "Equipment Nomenclature", kind: "auto", mandatory: false, source: "SFD" },
  { name: "Equipment Serial Number", kind: "auto", mandatory: true, source: "SFD" },
  { name: "Location On Board", kind: "auto", mandatory: true, source: "SFD" },
  { name: "Date of Occurrence", kind: "date", mandatory: true, source: "User" },
  { name: "Equipment Status", kind: "select", mandatory: true, source: "User", mandNote: "defect path" },
  { name: "Operational Severity", kind: "select", mandatory: true, source: "User" },
  { name: "Trials Required", kind: "radio", mandatory: false, source: "System (ITTTM)", radioOptions: ["Yes", "No"] },
  { name: "Defect Description", kind: "editor", mandatory: true, source: "User" },
  { name: "Spares Used / Spare Required", kind: "radio", mandatory: true, source: "User", radioOptions: ["Yes", "No"] },
  { name: "Attachment", kind: "file", mandatory: false, source: "User" },
];

export const SERVICES_FIELDS: OpmFieldSpec[] = [
  { name: "Service", kind: "select", mandatory: true, source: "Services Master" },
  { name: "Linked Equipment (optional)", kind: "select", mandatory: false, source: "CMMS" },
  { name: "Date Required", kind: "date", mandatory: true, source: "User" },
  { name: "Service Description", kind: "editor", mandatory: true, source: "User" },
  { name: "Place of Ship Availability", kind: "text", mandatory: true, source: "User" },
  { name: "Attachment", kind: "file", mandatory: false, source: "User" },
];

export const CLOSURE_FIELDS: OpmFieldSpec[] = [
  { name: "Closure Remarks", kind: "editor", mandatory: true, source: "User" },
  { name: "Closed By", kind: "auto", mandatory: false, source: "System" },
  { name: "Closure Date", kind: "auto", mandatory: false, source: "System" },
];

export const RAISE_DART_FIELDS: OpmFieldSpec[] = [
  { name: "DART Number", kind: "display", mandatory: true, source: "System" },
  { name: "DART Trigger", kind: "select", mandatory: true, source: "User" },
  { name: "Standby Available", kind: "radio", mandatory: true, source: "User", radioOptions: ["Yes", "No"] },
  { name: "Symptoms", kind: "select", mandatory: false, source: "System", mandNote: "mandatory unless exempted" },
  { name: "Type of Assistance Required", kind: "select", mandatory: true, source: "User" },
  { name: "Place of Ship Availability", kind: "text", mandatory: true, source: "User", mandNote: "defaults to homeport" },
  { name: "Diagnosed Reason of Defect", kind: "text", mandatory: false, source: "SFD", mandNote: "stage-mandatory" },
  { name: "Action Taken to Repair", kind: "text", mandatory: false, source: "User" },
];

/** Guarantee Defect — reused/auto-populated rows (read-only), name/value/source tuples. */
export const GD_REUSED: [string, string, string][] = [
  ["Ship", "HMS Daring D32", "Session context"],
  ["Department", "Marine Engineering", "Session context"],
  ["Equipment", "LO Pump - ME No.1", "Digital Defect Book"],
  ["Equipment Serial No", "SNME0142-A", "Digital Defect Book"],
  ["DART Number", "D-12345", "System-generated"],
  ["Defect Date", "22-Jun-2026", "Date of Occurrence"],
  ["Defect Description", "Bearing noise & vibration", "Digital Defect Book"],
  ["Cause / Reason for Defect", "Drive-end bearing wear", "Diagnosed Reason of Defect"],
  ["Affects Sea-going / Op Availability", "Partially Non Ops", "Equipment Status"],
];

export const GD_NEW_FIELDS: OpmFieldSpec[] = [
  { name: "Date (Future)", kind: "date", mandatory: true, source: "User" },
  { name: "Place of Repair", kind: "select", mandatory: true, source: "Master" },
];

// ---------------------------------------------------------------------------
// Add / Extend Guarantee (standalone)
// ---------------------------------------------------------------------------

export const GUARANTEE_FIELDS: OpmFieldSpec[] = [
  { name: "Equipment Name", kind: "select", mandatory: true, source: "SFD (Ship Configuration)" },
  { name: "Guarantee Start Date", kind: "date", mandatory: true, source: "User" },
  { name: "Guarantee End Date", kind: "date", mandatory: true, source: "User" },
  { name: "Justification", kind: "editor", mandatory: true, source: "User" },
];

export const GUARANTEE_APPROVAL: OpmGuaranteeStep[] = [
  { role: "Ship Staff", act: "Raises the add / extend guarantee request", icon: "user" },
  { role: "Department HOD", act: "Reviews & recommends — not an approval", icon: "square-check-big" },
  { role: "Commanding Officer", act: "Sole approval authority", icon: "shield-check" },
  { role: "Ship Administrator", act: "Executes coverage after CO approval", icon: "settings" },
];

export const GUAR_DONE_LABEL = ["Raised", "Recommended", "Approved", "Executed"];
export const GUAR_DEFAULT_BADGE = ["Raises", "Recommends", "Approves", "Executes"];

/** Fixed demo guarantee-per-equipment percentages, keyed by equipment name — same
 * lookup as the reference prototype (`GD_PCT_BY_RECORD`). */
const GD_PCT_BY_RECORD: Record<string, number> = { "LO Pump - ME No.1": 62 };

export interface GuaranteePercentInfo {
  pct: number;
  zone: "Green" | "Amber" | "Red";
  color: string;
  badgeBg: string;
  border: string;
  monthsRemain: number;
  remainLabel: string;
  pctLabel: string;
  pctWidth: string;
  commissionLabel: string;
  endLabel: string;
}

const GUARANTEE_COMMISSION_DATE = new Date(2025, 8, 18);

function formatDdMmmYyyy(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(date.getDate()).padStart(2, "0");
  return `${dd}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

/** Computes the guarantee-elapsed widget's percentage, color bands and commission/end
 * dates — same formula/thresholds as the reference prototype (24-month window). */
export function computeGuaranteePercent(equipItem: string, editing: boolean): GuaranteePercentInfo {
  const pct = editing ? GD_PCT_BY_RECORD[equipItem] ?? 43 : 93;
  let zone: GuaranteePercentInfo["zone"];
  if (pct < 50) {
    zone = "Green";
  } else if (pct < 75) {
    zone = "Amber";
  } else {
    zone = "Red";
  }
  const colorByZone: Record<GuaranteePercentInfo["zone"], string> = {
    Green: "#22C55E",
    Amber: "#F5B94B",
    Red: "#F82C36",
  };
  const color = colorByZone[zone];
  const monthsRemain = Math.max(0, Math.round(((100 - pct) / 100) * 24));
  const endDate = new Date(GUARANTEE_COMMISSION_DATE);
  endDate.setFullYear(endDate.getFullYear() + 2);
  return {
    pct,
    zone,
    color,
    badgeBg: `${color}22`,
    border: `${color}55`,
    monthsRemain,
    remainLabel: pct >= 100 ? "Guarantee period expired" : `${monthsRemain} month(s) remaining`,
    pctLabel: `${Math.round(pct)}%`,
    pctWidth: `${pct.toFixed(1)}%`,
    commissionLabel: formatDdMmmYyyy(GUARANTEE_COMMISSION_DATE),
    endLabel: formatDdMmmYyyy(endDate),
  };
}

// ---------------------------------------------------------------------------
// Raise RA
// ---------------------------------------------------------------------------

export const RA_TYPES: OpmRaType[] = [
  { key: "OP RA", desc: "Standard operational Required Assistance" },
  { key: "AMP", desc: "Assisted Maintenance Period RA (HQ-authorised harbour period)" },
  { key: "SMP", desc: "Self Maintenance Period RA" },
  { key: "Signal RA", desc: "RA in signal / letter form — no connectivity" },
  { key: "Normal RA", desc: "Default RA pathway" },
];

export const RA_COMMON: OpmFieldSpec[] = [
  { name: "Ship", kind: "auto", mandatory: false, source: "Context" },
  { name: "Department", kind: "auto", mandatory: false, source: "Context" },
  { name: "Date", kind: "date", mandatory: true, source: "User" },
  { name: "DART Raised Date", kind: "auto", mandatory: false, source: "DART" },
  { name: "RA Generation Date", kind: "auto", mandatory: false, source: "System" },
  // DTG (Date Time Group) — commented out for now; not required/shown until re-enabled.
  // { name: "DTG (Date Time Group)", kind: "auto", mandatory: false, source: "System" },
  { name: "Equipment Name / Code", kind: "auto", mandatory: false, source: "DART" },
  { name: "DART No.", kind: "auto", mandatory: false, source: "DART" },
  { name: "Additional Remarks", kind: "text", mandatory: false, source: "User" },
];

// DTG is commented out of RA_COMMON above for now, so every RA type renders the same
// field set — kept as a passthrough (rather than removing the function) so callers
// don't need to change when DTG's per-type mandatory behavior comes back.
export function raSpecsFor(raType: string): OpmFieldSpec[] {
  void raType;
  return RA_COMMON;
}

// ---------------------------------------------------------------------------
// Chip tones (DART list + Approval tracking)
// ---------------------------------------------------------------------------

export const OPM_STATUS_TONE_MAP: Record<OpmDartStatus, ChipTone> = {
  Draft: "neutral",
  Open: "info",
  "In Progress": "warning",
  "In Progress – With FMU": "warning",
  "In Progress – With Yard": "warning",
  "UNSAT – Fast-tracked to Yard": "danger",
  "Complete – Verification Required": "success",
  "Certificate Issued": "info",
  "DTNR (Refit)": "info",
  Closed: "success",
  Returned: "danger",
};

export const OPM_SEVERITY_TONE_MAP: Record<OpmSeverity, ChipTone> = {
  OPDEF: "danger",
  "OPDEF (STA)": "warning",
  "Normal Defect": "info",
};

export const OPM_ACT_FILTER_STATUS_OPTIONS: OpmDartStatus[] = [
  "In Progress",
  "In Progress – With FMU",
  "In Progress – With Yard",
  "UNSAT – Fast-tracked to Yard",
  "Complete – Verification Required",
  "Certificate Issued",
  "DTNR (Refit)",
  "Closed",
];
export const OPM_ACT_FILTER_SEVERITY_OPTIONS: OpmSeverity[] = Object.keys(OPM_SEVERITY_TONE_MAP) as OpmSeverity[];
export const OPM_ACT_FILTER_DATE_RANGE_OPTIONS = ["Last 30 days", "Last 90 days", "This year"];

// ---------------------------------------------------------------------------
// Prefill (editing / resuming an existing DART) — dummy demo values
// ---------------------------------------------------------------------------

const PREFILL_DEMO = {
  nomen: "PUMP,LUB OIL,CENTRIFUGAL",
  serial: "SNME0142-A",
  loc: "Machinery Space No.1",
  date: "2026-07-22",
  status: "Partially Non Ops",
  sev: "OPDEF",
  place: "Naval Dockyard, Portsmouth",
  diag: "Bearing wear — excessive vibration on drive-end",
  action: "Replaced bearing set; realigned pump-motor coupling",
  service: "Hull Painting",
  dart: "DART-2026-0142",
  trigger: "Onboard resources exhausted",
  standby: "No",
  symptoms: "Abnormal noise / vibration",
  assist: "Fleet Maintenance Unit",
  spares: "Yes",
  description:
    "Excessive vibration and abnormal noise observed on the drive-end bearing during routine running. Suspected bearing wear; equipment run restricted pending rectification.",
};

/** Ordered regex → value table backing `opmPrefillFor` — first match wins. `value` is
 * a function only because the Equipment Name rule needs `editItem`; every other rule
 * ignores its argument. Kept as a flat table (not a chain of `if`s) for the same
 * cognitive-complexity reason as `DEMO_OPTION_RULES` above. */
const PREFILL_RULES: { test: RegExp; value: (editItem: string) => string }[] = [
  { test: /Equipment Name/i, value: (editItem) => editItem },
  { test: /Type$/i, value: () => "Major" },
  { test: /Nomenclature/i, value: () => PREFILL_DEMO.nomen },
  { test: /Serial (No|Number)/i, value: () => PREFILL_DEMO.serial },
  { test: /Location On Board|^Location$/i, value: () => PREFILL_DEMO.loc },
  { test: /Date of Occurrence|^Date$/i, value: () => PREFILL_DEMO.date },
  { test: /Equipment Status/i, value: () => PREFILL_DEMO.status },
  { test: /Severity/i, value: () => PREFILL_DEMO.sev },
  { test: /Place of Ship Availability/i, value: () => PREFILL_DEMO.place },
  { test: /Diagnosed Reason/i, value: () => PREFILL_DEMO.diag },
  { test: /Action Taken/i, value: () => PREFILL_DEMO.action },
  { test: /^Service$/i, value: () => PREFILL_DEMO.service },
  { test: /DART Number/i, value: () => PREFILL_DEMO.dart },
  { test: /DART Trigger/i, value: () => PREFILL_DEMO.trigger },
  { test: /Standby Available/i, value: () => PREFILL_DEMO.standby },
  { test: /Symptoms/i, value: () => PREFILL_DEMO.symptoms },
  { test: /Type of Assistance/i, value: () => PREFILL_DEMO.assist },
];

/** Dummy prefill values used when editing/resuming an existing DART — mirrors the
 * reference prototype's `opPrefillFor`. `editItem` fills the Equipment Name field. */
export function opmPrefillFor(name: string, editItem: string): string {
  return PREFILL_RULES.find((rule) => rule.test.test(name))?.value(editItem) ?? "";
}

export type OpmDartDetailBadge = "System" | "SFD" | "User";

export interface OpmDartDetailField {
  label: string;
  value: string;
  badge: OpmDartDetailBadge;
  /** Renders full-width in the record-details grid instead of one of three columns. */
  wide?: boolean;
}

/** The read-only "Digital Defect Book — Record Details" field list shown when a
 * worklist row is clicked (see `openView()`/the DART detail drawer). Fields not
 * captured on `OpmDartRow` itself (Nomenclature, Serial No, Location, Equipment
 * Status, Spares Used, Description) reuse the same demo values as the Add form's
 * editing-prefill (`PREFILL_DEMO`) — this app has no live per-DART record store,
 * so both views draw from the one static mock dataset. */
export function dartDetailFieldsFor(row: OpmDartRow): OpmDartDetailField[] {
  return [
    { label: "DART No.", value: row.dart, badge: "System" },
    { label: "Equipment Name", value: row.item, badge: "SFD" },
    { label: "Reason", value: row.reason, badge: "User" },
    { label: "Equipment Nomenclature", value: PREFILL_DEMO.nomen, badge: "SFD" },
    { label: "Equipment Serial No", value: PREFILL_DEMO.serial, badge: "SFD" },
    { label: "Location On Board", value: PREFILL_DEMO.loc, badge: "User" },
    { label: "Date of Occurrence", value: row.date, badge: "User" },
    { label: "Equipment Status", value: PREFILL_DEMO.status, badge: "User" },
    { label: "Operational Severity", value: row.sev, badge: "User" },
    { label: "Defect Rectified", value: row.rect, badge: "User" },
    { label: "Status", value: row.status, badge: "System" },
    { label: "Spares Used", value: PREFILL_DEMO.spares, badge: "User" },
    { label: "Defect Description", value: PREFILL_DEMO.description, badge: "User", wide: true },
  ];
}

// ---------------------------------------------------------------------------
// Mock master data (DART list, Approval tracking, Recent Activity, Spares, Guidance)
// ---------------------------------------------------------------------------

export const OPM_DART_ROWS: OpmDartRow[] = [
  { dart: "DART-2026-0145", item: "Gyro Compass", reason: "Defect", rect: "No", status: "Draft", date: "29 Jul 2026", sev: "OPDEF (STA)", eligible: false },
  { dart: "DART-2026-0142", item: "Sea Viper Director", reason: "Defect", rect: "No", status: "Open", date: "26 Jun 2026", sev: "OPDEF (STA)", eligible: true },
  { dart: "DART-2026-0141", item: "LO Pump - ME No.1", reason: "Defect", rect: "No", status: "In Progress", date: "26 Jun 2026", sev: "OPDEF", eligible: true },
  { dart: "DART-2026-0138", item: "Diesel Alternator", reason: "Defect", rect: "No", status: "In Progress – With FMU", date: "24 Jun 2026", sev: "OPDEF", eligible: true },
  { dart: "DART-2026-0135", item: "Gyro Compass", reason: "Defect", rect: "Yes", status: "Closed", date: "23 Jun 2026", sev: "Normal Defect", eligible: false },
  { dart: "DART-2026-0131", item: "440V Switchboard", reason: "Defect", rect: "Yes", status: "UNSAT – Fast-tracked to Yard", date: "15 Jul 2026", sev: "OPDEF", eligible: true },
  { dart: "DART-2026-0128", item: "440V Switchboard", reason: "Defect", rect: "Yes", status: "Closed", date: "20 Jun 2026", sev: "Normal Defect", eligible: false },
  { dart: "DART-2026-0124", item: "CIWS Mount", reason: "ABER", rect: "No", status: "Returned", date: "18 Jun 2026", sev: "OPDEF", eligible: true },
  { dart: "DART-2026-0119", item: "Painting — Hull", reason: "Services", rect: "No", status: "Open", date: "17 Jun 2026", sev: "Normal Defect", eligible: true },
  { dart: "DART-2026-0115", item: "Steering Gear", reason: "As&As", rect: "Yes", status: "Closed", date: "15 Jun 2026", sev: "Normal Defect", eligible: false },
  { dart: "DART-2026-0111", item: "Sonar Transducer", reason: "Defect", rect: "No", status: "Complete – Verification Required", date: "13 Jun 2026", sev: "OPDEF (STA)", eligible: true },
];

export const RA_STATUS_ROWS: OpmApprovalRow[] = [
  { id: "DART-2026-0142", item: "LO Pump - ME No.1", type: "Defect", submittedBy: "Marine Eng · Lt Cdr Menon", date: "22-Jun-26", status: "In Progress", authority: "FMU", remarks: "Routed to FMU for assessment" },
  { id: "RA-2026-0012", item: "Gyro Compass", type: "OP RA", submittedBy: "Navigation · Lt Cdr Kapoor", date: "19-Jun-26", status: "Complete – Verification Required", authority: "Yard", remarks: "Repair reported complete by the Yard — Ship Staff SAT / UNSAT verification required", agency: "Yard" },
  { id: "RA-2026-0011", item: "Sea Viper Director", type: "OP RA", submittedBy: "Weapon Eng · Cdr Rao", date: "18-Jun-26", status: "In Progress – With FMU", authority: "FMU", remarks: "FMU team assigned" },
  { id: "RA-2026-0009", item: "Painting — Hull", type: "AMP", submittedBy: "Logistics · Lt Das", date: "16-Jun-26", status: "In Progress – With Yard", authority: "Yard", remarks: "Awaiting yard slot" },
  { id: "RA-2026-0006", item: "Fire Main Pump", type: "OP RA", submittedBy: "Marine Eng · Lt Cdr Menon", date: "09-Jun-26", status: "Certificate Issued", authority: "Yard", remarks: "BLR certificate recorded", certType: "BLR", certMeaning: "Beyond Local Repair", certDate: "12-Jun-26", certAuth: "Fleet Maintenance Unit" },
  { id: "RA-2026-0003", item: "Diesel Alternator", type: "Normal RA", submittedBy: "Marine Eng · Lt Cdr Menon", date: "05-Jun-26", status: "DTNR (Refit)", authority: "Yard", remarks: "Deferred to next planned refit — beyond local / harbour capability", deferOutcome: "DTNR (Refit)", deferDate: "07-Jun-26", refitRef: "Refit-2027-Q1" },
  { id: "DART-2026-0131", item: "440V Switchboard", type: "Defect", submittedBy: "Electrical · Lt Sharma", date: "15-Jun-26", status: "UNSAT – Fast-tracked to Yard", authority: "Yard", remarks: "UNSAT — rework at Yard" },
];

export const OP_ACTIVITY: OpmActivityRow[] = [
  { kind: "Defect", title: "Gyro Compass", code: "DART-2026-0145", reason: "Defect", rect: "No", status: "Draft", when: "Today · 1140 hrs", by: "You", resumable: true, note: "Defect Description & attachment pending" },
  { kind: "RA", title: "RA — LO Pump - ME No.1", code: "RA-2026-0061", reason: "", rect: "—", status: "Draft", when: "Today · 0925 hrs", by: "You", resumable: true, note: "Routing not yet submitted" },
  { kind: "Service", title: "Ventilation Trunk Cleaning", code: "DART-2026-0148", reason: "Services", rect: "—", status: "Draft", when: "Yesterday · 1655 hrs", by: "You", resumable: true, note: "Place of ship availability pending" },
  { kind: "Defect", title: "LO Pump - ME No.1", code: "DART-2026-0142", reason: "Defect", rect: "No", status: "Raised", when: "22-Jul · 1815 hrs", by: "You", resumable: false },
  { kind: "RA", title: "RA — Sea Viper Director", code: "RA-2026-0058", reason: "", rect: "—", status: "Submitted", when: "21-Jul · 1050 hrs", by: "You", resumable: false },
  { kind: "Service", title: "Painting — Hull", code: "DART-2026-0136", reason: "Services", rect: "—", status: "With Yard", when: "16-Jul · 1420 hrs", by: "You", resumable: false },
  { kind: "Defect", title: "440V Switchboard", code: "DART-2026-0131", reason: "Defect", rect: "Yes", status: "Closed", when: "15-Jul · 0940 hrs", by: "You", resumable: false },
];

export const UNMAPPED_SPARES: OpmSpareRow[] = [
  { pattern: "PT-4471-A", desc: "Ball Bearing 6205-2RS", qtyIssued: "2", qtyHeld: "6", denom: "Nos", issueDate: "20-Jun-2026", issuedTo: "PO(ME) Ramesh K", invType: "Naval Store", crp: "Consumable", authority: "DT-87 / DMD-2026-0442" },
  { pattern: "PT-2288-C", desc: "Mechanical Seal Kit 45mm", qtyIssued: "1", qtyHeld: "2", denom: "Set", issueDate: "19-Jun-2026", issuedTo: "PO(ME) Ramesh K", invType: "Naval Store", crp: "Returnable", authority: "DT-87 / DMD-2026-0439" },
  { pattern: "PT-9017-B", desc: "Gasket, Flange DN65", qtyIssued: "4", qtyHeld: "12", denom: "Nos", issueDate: "18-Jun-2026", issuedTo: "LME Suresh P", invType: "Weapon Store", crp: "Consumable", authority: "DT-87 / DMD-2026-0431" },
  { pattern: "PT-3355-A", desc: "O-Ring Set, Nitrile", qtyIssued: "1", qtyHeld: "8", denom: "Set", issueDate: "16-Jun-2026", issuedTo: "LME Suresh P", invType: "Naval Store", crp: "Consumable", authority: "DT-87 / DMD-2026-0420" },
];

export const TRIAL_AGENCY_OPTIONS = ["Fleet Maintenance Unit", "Naval Dockyard", "OEM Representative", "ITTTM Cell"];

export const GUIDANCE: OpmGuidanceItem[] = [
  { icon: "history", color: "#4ade80", label: "Have I Seen This Before", value: "Yes — 2 prior defects on this equipment", group: "personal" },
  { icon: "square-check-big", color: "#4ade80", label: "My Past Resolution", value: "Drive-end bearing kit renewed · cleared at 1,800h watch", group: "personal" },
  { icon: "copy", color: "#7fb3e0", label: "Similar Defects — Same Ship", value: "3 found on HMS Daring D32", group: "personal" },
  { icon: "lightbulb", color: "#F5B94B", label: "Fleet Recommendation", value: "Renew drive-end bearing — most frequent effective fix", group: "fleet" },
  { icon: "network", color: "#7fb3e0", label: "Similar Defects — Across Fleet", value: "11 across 4 ships", group: "fleet" },
  { icon: "package", color: "#7fb3e0", label: "Probable Spares Required", value: "Bearing kit · shaft seal", group: "fleet" },
  { icon: "message-square-text", color: "#7fb3e0", label: "Suggested Wording", value: '"Abnormal vibration at drive-end bearing; suspect wear."', group: "support" },
  { icon: "wrench", color: "#7fb3e0", label: "Probable Defective Component", value: "Drive-end bearing", group: "support" },
  { icon: "triangle-alert", color: "#F5B94B", label: "Probability of Recurrence", value: "High (68%)", group: "support" },
  { icon: "chart-line", color: "#7fb3e0", label: "MTBF / MTTR", value: "MTBF 4,200h · MTTR 11d", group: "support" },
  { icon: "circle-check-big", color: "#4ade80", label: "Open Duplicate", value: "None open", group: "support" },
  { icon: "triangle-alert", color: "#F82C36", label: "Defect Escalation Guidance", value: "Defect → OPDEF risk in 6 days", group: "support" },
];

export const EQUIPMENT_HISTORY_STATS: OpmEquipmentHistoryStat[] = [
  { value: "Operational", label: "Current Status", color: "#22C55E" },
  { value: "14,280 hrs", label: "Running Hours" },
  { value: "2", label: "Pending Defects", color: "#F5B94B" },
  { value: "3", label: "Pending Routines" },
];

export const EQUIPMENT_HISTORY_SECTIONS: OpmEquipmentHistorySection[] = [
  { title: "Installation History", rows: [{ label: "Installed", value: "18-Sep-2025 · Naval Dockyard, Portsmouth" }] },
  { title: "Removal History", rows: [{ label: "Last removal", value: "None on record" }] },
  {
    title: "Maintenance History",
    rows: [
      { label: "Last routine", value: "Quarterly Trial — LO System · 04-Jun-2026" },
      { label: "Last overhaul", value: "22-Jan-2026" },
    ],
  },
  {
    title: "Defect History",
    rows: [
      { label: "DART-2026-0142", value: "Bearing noise & vibration · Open" },
      { label: "DART-2025-0871", value: "Bearing wear — excessive vibration · Closed" },
    ],
  },
  { title: "Pending Defects", rows: [{ label: "DART-2026-0142", value: "In Progress" }] },
  {
    title: "Pending Routines",
    rows: [
      { label: "Quarterly Trial", value: "Due 04-Sep-2026" },
      { label: "LO Sample Analysis", value: "Due 12-Aug-2026" },
    ],
  },
];
