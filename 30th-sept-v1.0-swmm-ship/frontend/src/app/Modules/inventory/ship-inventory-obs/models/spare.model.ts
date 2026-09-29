// `QUASI_PERMANENT` is the fourth value `Spares.CATEGORY_CHOICES` now
// carries (backend/obs/models.py). It is quasi-permanent, it is equivalent to permanent, and
// it reaches a spare only through the import's source-of-truth correction from a WED item —
// the WED Item Search screen's own column is headed `Item Category(C/P/QP)`. It is never
// offered on the Add Spare form, because a workbook's CATEGORY column still takes P, C or R
// only (rules clause 2.9.1).
export type SpareCategory = "CONSUMABLE" | "PERMANENT" | "QUASI_PERMANENT" | "RETURNABLE" | "IM";

export const SPARE_CATEGORY_LABEL: Record<SpareCategory, string> = {
  CONSUMABLE: "C",
  PERMANENT: "P",
  // Shown as QP, which is the label the WED side already uses.
  QUASI_PERMANENT: "QP",
  RETURNABLE: "R",
  IM: "IM",
};

/** Automatic criticality tier, computed server-side from yearly issue frequency
 * (`backend/obs/models.py` — `Spares.apply_criticality_from_issue_history`). Only
 * ever rises; never client-writable. */
export type CriticalityStrength = "NONE" | "LOW" | "MODERATE" | "HIGH";

export const CRITICALITY_STRENGTH_LABEL: Record<CriticalityStrength, string> = {
  NONE: "-",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
};

/** THE ONE ABSENT-VALUE MARKER for this feature.
 *
 * There was no shared convention and the codebase disagreed with itself — four competing literals
 * in live use inside this one folder: the em dash (the search drawer's three "About Spare" rows,
 * the history grid's returned-item status, the spare-detail pager, the masters page's blank
 * option), the hyphen (`CRITICALITY_STRENGTH_LABEL.NONE` just above, the spare-detail remarks
 * line, the issue-status list), `"NA"` (the return list's unit name), and one documented one-off,
 * `"NA (recorded while import)"`.
 *
 * The em dash is chosen because it is the most used of the four, because it is what THIS screen's
 * own quick-view drawer already writes for Equipment Class, Denomination and Authority — three
 * fields that sit beside the grid columns this marks — and because the same choice was already
 * made independently outside this feature, in a `valueFormatter` in exactly this position
 * (`Pages/home/daily-orders-history/daily-orders-history.ts`).
 *
 * It is deliberately NOT the hyphen. `CRITICALITY_STRENGTH_LABEL.NONE` above is a different thing
 * wearing a similar mark: it is a real domain state ("this spare has not been escalated"), not an
 * absent value, and the two must stay distinguishable. That is also why the Criticality column is
 * left to its own label map rather than being given this marker.
 *
 * Declared here, beside the labels it sits with, rather than inline at each call site — so the
 * second use has something to reuse and there is one line to change if the mark ever changes. */
export const ABSENT_VALUE_LABEL = "—";

/** Mirrors `HIGH_HOLDING_QUANTITY_THRESHOLD`/`HIGH_HOLDING_REASON_MIN_LENGTH` in
 * `backend/obs/models.py` — keep both sides in step. Client-side use is a live UX
 * hint only; the backend rule is what's actually enforced. */
export const HIGH_HOLDING_THRESHOLD = 20;
export const HIGH_HOLDING_REASON_MIN_LENGTH = 10;

/** The placeholder shown when a spare has no photograph, or when the one it names cannot be
 * loaded. Served from the app's own assets rather than from the API's media folder, so it is
 * still there when the API is the thing that is unreachable — which is precisely the case that
 * used to render a broken image frame with the alt text showing through. The backend has its own
 * copy of the same artwork at `MEDIA_ROOT/obs/default.png` (`manage.py seed_obs_media`). */
export const DEFAULT_SPARE_IMAGE = "assets/images/default-spare.png";

/** The stored value `Spares.image` carries when a spare has never had a photograph uploaded —
 * `backend/obs/models.py` declares `default="obs/default.png"` and `backend/obs/utils.py` names
 * the same string `DEFAULT_SPARE_IMAGE_NAME`. `SparesSerializer` sends it through unaltered as an
 * absolute media URL, so `view/<pk>/` reports the shared placeholder as though it were this
 * spare's own photograph. `adaptSpare()` tests for it and treats it as absent, which is what
 * makes the detail page's caption and the Update form's "no photograph yet" frame tell the truth.
 * Deliberately NOT the bare `default.png`, because `backend/ilms/models.py` uses that name for a
 * different field under `items/`. */
export const PLACEHOLDER_SPARE_IMAGE_NAME = "obs/default.png";

export interface Spare {
  id: string;
  departmentId?: string;
  /** Display-only — resolved from `departmentId` via the department dropdown's own
   * label list, since the spare rows themselves never carry a department name. */
  departmentName?: string;
  spareClass: string;
  equipmentClass: string;
  patternNumber: string;
  description: string;
  compartment: string;
  rackPosition: string;
  rackNumber: string;
  location: string;
  category: SpareCategory;
  critical: boolean;
  criticalityStrength: CriticalityStrength;
  denomination: string;
  authority: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  /** Qty Authorised minus Qty Held, computed server-side by
   * `SparesQuerySet.d787j_deficiencies()` so the grid, the exports and the homepage
   * tile all read one number. Present only on the D787J Deficiency payload — hence
   * optional, so the other call sites of `adaptSpare` are unaffected. Always >= 1
   * where present, since a row only qualifies when it is strictly short. */
  deficiencyQuantity?: number;
  page: string;
  line: string;
  remarks: string;
  imageUrl?: string;
}

export interface SpareSearchFilters {
  department?: string;
  /** The Executive sub-department filter — requirement 3.1. Sent as
   * `?sub_department=`, alongside the existing non-default `?department=`.
   *
   * Three values are meaningful: a `master.SubDepartment` id narrows to that sub-department,
   * `"unassigned"` returns the spares that carry none (every row that predates the sub-department
   * field, which are surfaced rather than hidden), and omitting it returns all of them together —
   * which is what the Executive Head of Department sees by default. A Dy HOD confined to one
   * sub-department is scoped to it server-side regardless of what is sent here. */
  subDepartment?: string;
  spareClass?: string;
  equipmentClass?: string;
  equipmentClassText?: string;
  patternNumber?: string;
  description?: string;
  remarksText?: string;
  q?: string;
}

export interface SpareFormPayload {
  spareClass: string;
  equipmentClass: string;
  /** May be "" — leaving it blank asks the backend to auto-generate one. */
  patternNumber: string;
  description: string;
  compartment: string;
  rackPosition: string;
  rackNumber: string;
  location: string;
  category: SpareCategory;
  critical: boolean;
  denomination: string;
  authority: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  page?: string;
  line?: string;
  remarks?: string;
  image?: File | null;
}

export interface DropdownOptionDto {
  label: string;
  value: string;
}

export interface IncreaseHoldingPayload {
  quantityToAdd: number;
  remarks: string;
}

export interface ExistingSpareSummary {
  id: string;
  patternNumber: string;
  description: string;
  equipmentClassName?: string;
  spareClassName?: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  inUserDepartment: boolean;
}

/** Parsed from a `409` on `POST add/` — see `ObsApiService.addSpare()`/
 * `parseSpareConflict()`. `duplicate-pattern` is a hard block (a pattern number is a
 * ship-wide identifier); `duplicate-description` is a soft, confirm-to-proceed
 * warning scoped to the caller's own department. */
export type SpareConflict =
  | { kind: "duplicate-pattern"; message: string; existing: ExistingSpareSummary }
  | { kind: "duplicate-description"; message: string; existing: ExistingSpareSummary[] };

export function isSpareConflict(value: unknown): value is SpareConflict {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    (value.kind === "duplicate-pattern" || value.kind === "duplicate-description")
  );
}

// ---------------------------------------------------------------------------------------
// References > Masters > Upload CPIL — `ilms.VendorPilViewSet`'s `ExcelImportExportMixin`
// (same shared mixin MO/WED's masters "Import Data" tabs use). Only one importable sheet here
// (no "kind" dropdown needed, unlike MO/WED which each import 2 different masters).
// ---------------------------------------------------------------------------------------

export interface VendorPilImportRowError {
  row: number;
  errors: Record<string, string[]>;
}

export interface VendorPilImportResult {
  /** "imported" covers both a successful import AND a row-validation failure (imported=0 — this
   * import is all-or-nothing, so any invalid row blocks the whole file) — check
   * `invalidRows`/`errors` to tell the two apart. "column_error"/"row_limit_error" are the two
   * file-level rejection shapes the backend returns before it even looks at individual rows. */
  status: "imported" | "dry_run" | "column_error" | "row_limit_error";
  imported: number;
  validRows: number;
  invalidRows: number;
  errors: VendorPilImportRowError[];
  /** Only populated for "column_error" (unsupported columns) / "row_limit_error" (too many rows). */
  headerErrors: string[];
  allowedColumns: string[];
}
