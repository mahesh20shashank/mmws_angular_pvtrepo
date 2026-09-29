export type IssueReason = "Defect" | "Ty Loan - Other Ship";

/** Mirrors `HIGH_ISSUE_QUANTITY_THRESHOLD` in `backend/obs/models.py` — keep both sides in
 * step. Client-side use is a live UX hint only; the backend rule is what's actually enforced. */
export const HIGH_ISSUE_QUANTITY_THRESHOLD = 3;

export interface MultiIssueRow {
  spareId: string;
  patternNumber: string;
  description: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  quantityIssued: number;
  /** Required server-side when quantityIssued exceeds HIGH_ISSUE_QUANTITY_THRESHOLD
   * (`backend/obs/models.py`) — mirrors the >20-holding-reason pattern used elsewhere. */
  highQuantityReason?: string;
}

// Developed with Understanding: the Issue Spare form's submit shape. The Ty Loan branch's free-text
// Issued to Ship and Enter Ship Name are gone (D11) - it now carries the Command and Unit Name
// filter codes (never sent, the server derives issued_to_unit) and the picked other-unit person.
export interface MultiIssuePayload {
  reason: IssueReason;
  remarks: string;
  username?: string;
  section?: string;
  equipmentName?: string;
  command?: string;
  // Developed with Understanding: Unit Name filter code on the Ty Loan branch. Filter only, not sent.
  unit?: string;
  // Developed with Understanding: `OtherCustomUserProfile` pk picked in the Ty Loan Issued To field.
  issuedToOtherProfile?: string;
  rows: MultiIssueRow[];
}

export interface MultiIssueResult {
  issued: string[];
  errors: { patternNumber: string; error: string }[];
}

export type ReturnedItemStatus = "same" | "new";

export interface ReturnSparePayload {
  quantityReturned: number;
  returnedBy: string;
  itemStatus: ReturnedItemStatus;
  remarks: string;
}

/** How a pending-return row was issued out. Drives the Return grid's coloured status flag,
 * its Ty Loan filter and whether the Unit Name column carries a unit or reads "NA".
 *
 * A row is TY_LOAN when it was issued with the "Ty Loan - Other Ship" reason OR when the
 * person holding it belongs to a unit other than the ship recorded in masters — the second
 * test is the server's own `is_own_unit` (see `onboard-spares/return-users/`), because the
 * front end has no way to resolve which ship this installation is. */
export type IssueType = "INTERNAL" | "TY_LOAN";

/** One person in Ship Inventory's user directory. Sourced from every `CustomUserProfile` that
 * can sign in, not just the caller's own department — a Ty Loan is handed back by somebody
 * from the other unit, and a grid still has to name a holder wherever they sit.
 *
 * The list is deliberately unfiltered, so not every entry may be OFFERED in a picker: gate on
 * `selectable`, and additionally on `inScope` for the two "Issued To" pickers. */
export interface ObsUserOption {
  id: string;
  name: string;
  rank: string;
  personalNumber: string;
  role: string;
  unitName: string;
  // Developed with Understanding: designation text from `inventory-users` (CP-G), shown in the
  // D5 option label.
  designation: string;
  /** Belongs to the ship recorded in masters — i.e. an internal issue, not a Ty Loan. */
  isOwnUnit: boolean;
  /** Real personnel: their personal number starts with a digit. False for the accounts
   * `seed_all.py` writes (`PN0001`…), which must never be issued or returned against. */
  isAdUser: boolean;
  /** May a picker offer this person? Normally the same as `isAdUser`, but while NO real
   * personnel exist at all the guests stand in so the screens are not simply unusable — the
   * server decides, because that answer depends on the whole directory.
   *
   * This is the flag for "Returned by" on Return, which is not department-scoped: a Ty Loan
   * comes back from another unit. */
  selectable: boolean;
  /** Visible under the caller's own department scoping. */
  inScope: boolean;
  /** The flag for the two "Issued To" pickers — `selectable` narrowed to the caller's own
   * department, except while the guest fallback is standing in for absent personnel. */
  selectableForIssue: boolean;
}

/** `name | rank | personal no | role | unit name`, with blank parts dropped so a profile
 * missing (say) a rank doesn't render a dangling separator. */
// Developed with Understanding: now in the D5 order NAME | PERSONAL NO | SHIP NAME | DESIGNATION |
// ROLE (the doc line above is the superseded order, kept as written). Rank stays on the row for
// search but is no longer in the label (R2 Q7). Takes only the five parts, so the own-ship row
// (`ObsUserOption`) and the Ty Loan row (`OtherUnitUser`) share one label. Blank parts are still
// dropped.
export function obsUserOptionLabel(
  user: Pick<ObsUserOption, "name" | "personalNumber" | "unitName" | "designation" | "role">,
): string {
  return [user.name, user.personalNumber, user.unitName, user.designation, user.role]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

// Developed with Understanding: the only `reason` value `returns/inventory-users/` acts on (CP-G
// API Contract section 2). Without it the endpoint answers today's list, which Requisition Issue
// keeps using (R2 Q13).
export type InventoryUsersReason = "DEFECT";

// Developed with Understanding: mirrors `OTHER_UNIT_SEARCH_MIN_LENGTH` in `obs/views/workflow.py` -
// the Ty Loan picker lists nobody until a Command, a Unit Name or a search this long is given.
export const OTHER_UNIT_SEARCH_MIN_LENGTH = 2;

// Developed with Understanding: the Ty Loan picker reads only the first page, at the backend's
// default size of 20 (D12 caps a page at 50).
export const OTHER_UNIT_USERS_PAGE_SIZE = 20;

// Developed with Understanding: one other-unit person offered by the Ty Loan Issued To field,
// adapted from `returns/other-unit-users/`. `id` is the `OtherCustomUserProfile` pk. `role` is
// always GUEST, display only (D5).
export interface OtherUnitUser {
  id: string;
  name: string;
  personalNumber: string;
  rank: string;
  unitName: string;
  unitCode: string;
  commandCode: string;
  commandName: string;
  designation: string;
  role: string;
  isOwnUnit: boolean;
  selectableForIssue: boolean;
}

// Developed with Understanding: the three inputs of one Ty Loan picker query - Command code, Unit
// Name code and the typed search text.
export interface OtherUnitUserQuery {
  command: string;
  unit: string;
  search: string;
}

// Developed with Understanding: the first page of a Ty Loan picker query. `count` is the total
// number of matches, so the screen can say more exist than the page shows.
export interface OtherUnitUserPage {
  count: number;
  users: OtherUnitUser[];
}

// Developed with Understanding: one Command or Unit Name filter option over current other-unit
// personnel, with its head count.
export interface OtherUnitFilterOption {
  code: string;
  name: string;
  count: number;
}

// Developed with Understanding: the two Ty Loan filter lists from
// `returns/other-unit-users/filters/`. `units` is narrowed by the Command asked for.
export interface OtherUnitUserFilters {
  commands: OtherUnitFilterOption[];
  units: OtherUnitFilterOption[];
}

// Developed with Understanding: true when a Ty Loan picker query can be sent - the backend answers
// 400 without a Command, a Unit Name or a search of at least OTHER_UNIT_SEARCH_MIN_LENGTH.
export function isOtherUnitQueryReady(query: OtherUnitUserQuery): boolean {
  return (
    !!query.command || !!query.unit || query.search.trim().length >= OTHER_UNIT_SEARCH_MIN_LENGTH
  );
}

export interface IssueListEntry {
  issuePk: string;
  spareId: string;
  patternNumber: string;
  description: string;
  issueDate: string;
  username: string;
  issuedQty: number;
  authority: string;
  reason: IssueReason;
  equipmentNomenclature: string;
  equipmentClass: string;
  spareClass: string;
  category: string;
  denomination: string;
  critical: boolean;
  /** Row is disabled (forwarded to MO/WED for replenishment) until stock is replenished. */
  isWedMo: boolean;
  /** What is STILL owed on this row — `IssueList.quantity_toreturn`, which drops as parts of
   * the issue come back. Distinct from `issuedQty`, which is the original issued figure and
   * never moves: return 2 of 5 and this reads 3 while `issuedQty` still reads 5. On the
   * dashboard lists, which have no pending-return row, it falls back to `issuedQty`. */
  outstandingQty: number;
  /** Unit the holder belongs to. "NA" for an internal issue — the holder is on this ship, so
   * there is no other unit to name. */
  unitName: string;
  issueType: IssueType;
}

export interface ObsDashboardCounts {
  sparesIssuedToMaintainers: number;
  sparesIssuedOnTyLoan: number;
  sparesReturned: number;
  sparesLessThan50Percent: number;
  d787jDeficiency: number;
  criticalSpareList: number;
}

export interface IssuedReturnedTrend {
  months: string[];
  defect: { issued: number[]; returned: number[] };
  tyLoan: { issued: number[]; returned: number[] };
}
