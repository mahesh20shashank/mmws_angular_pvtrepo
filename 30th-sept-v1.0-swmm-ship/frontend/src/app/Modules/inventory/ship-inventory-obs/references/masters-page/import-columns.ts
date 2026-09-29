/** The working table's column vocabulary, in one file.
 *
 * These lived inside `masters-page.ts` when the working table was the only thing that read
 * them. Requirement 3.3's hand-entry mode adds a second reader - the row editor, which is now
 * a component of its own so that building a row by hand and correcting an imported row are
 * literally the same dialogue rather than two implementations of it. A component cannot import
 * from the page that imports it without a cycle, so the shared half moved here and neither
 * side owns the other.
 *
 * Nothing in this file changed in behaviour when it moved.
 */
import { ExcelImportPreviewRow, ExcelImportRowData, ExcelImportRowStatus } from "../../services/obs-api.service";

/** One column of the working table.
 *
 * `key` reads the value out of `ExcelImportPreviewRow.data`. `apiField` is the name the back
 * end knows the same column by - the name an edit is posted under, the name a hand-built row
 * is posted under, and the name a source-of-truth correction names in
 * `row.corrections[].field` - so the three never have to be matched by eye.
 *
 * `header` IS THE WORKBOOK'S OWN HEADER STRING, character for character. It used to be a screen
 * label written independently of the sheet - `Qty Held` for `QUANTITY HELD`, `Page` for
 * `D787J PAGE NUMBER`, and `Location` for a column the workbook calls `BOX NUMBER` - so an
 * operator checking the table against the sheet they had just filled in was matching two
 * different vocabularies by eye. There is one vocabulary now and the workbook owns it.
 *
 * `editable` is false for the three columns that are not a per-row value to correct: AUTHORITY is
 * a whole-file gate checked against the authority chosen on the form above, SHIP CUSTOMER CODE is
 * reconciled against the active ship for the whole sheet, and SER is shown from the sheet but
 * stored nowhere, so an edit to it could change nothing. */
export interface ImportColumn {
  key: keyof ExcelImportRowData;
  apiField: string;
  header: string;
  width: number;
  editable: boolean;
}

/** THE WORKBOOK'S TWENTY COLUMNS, IN THE WORKBOOK'S ORDER.
 *
 * All ten curated templates carry one identical header row on their `OBS` sheet - SER through
 * SHIP CUSTOMER CODE - and this list is that row, in that sequence, spelled that way. Read the
 * table left to right with the workbook open beside it and the two agree column for column.
 *
 * IT WAS EIGHTEEN COLUMNS IN A DIFFERENT ORDER UNDER DIFFERENT NAMES. The order came from the
 * reference screen rather than from the sheet, so CRITICAL sat sixth here and seventeenth in the
 * workbook; three of the sheet's columns were missing; and one column - `MO Demand No` - was
 * shown that appears in NO template at all. It came from the two retired static templates, which
 * carried `MO DEMAND NO` in place of the two D787J columns (see `ship-inventory-obs.nav.ts`),
 * and it survived here and in the back end's header map long after the curated workbooks
 * dropped it. On every real import it was blank.
 *
 * TWO OF THE THREE NEW ONES ARE READ-ONLY AND STORED NOWHERE. SER reaches no `Spares` field and
 * SHIP CUSTOMER CODE is reconciled against the ship and discarded. Both are shown because an
 * operator checking their sheet against this table needs to find the row, and SER is how they
 * refer to it. `Row`, `Status`, `ERRORS` and `ACTION` are the application's own columns, not the
 * workbook's, and keep their own names.
 *
 * PICTURE PATH IS NEITHER. The server now opens the path it names and stores the photograph on
 * the spare, so the column is real data - and it is EDITABLE, which none of the other three are.
 * The ways it fails are the server's rather than the sheet's: an unshared folder, the operator's
 * own drive letter, a renamed file. The preview reports each of those per row as an advisory,
 * and an editable cell is what lets the operator answer that report where they are reading it.
 *
 * SER IS NOT THE PINNED `Row` COLUMN. `Row` is the OBS sheet row, 2 upwards, which is what the
 * preview reports and what every error message counts in. SER is the workbook's own serial, 1
 * upwards. They differ by the header row and both are worth having.
 *
 * WIDTHS BELOW 120 ARE FICTION. `DataGrid.defaultColDef` forces `minWidth: 120` (and a
 * `maxWidth` of 350) onto every column it is given, so SER and CRITICAL declaring 80 and 110
 * described a layout that never rendered. They say 120, which is what they get. */
export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "ser", apiField: "ser", header: "SER", width: 120, editable: false },
  { key: "spareClass", apiField: "spare_class", header: "SPARE CLASS", width: 170, editable: true },
  { key: "equipmentClass", apiField: "equipment_class", header: "EQUIPMENT CLASS", width: 200, editable: true },
  { key: "patternNumber", apiField: "pattern_number", header: "PATTERN NUMBER", width: 190, editable: true },
  { key: "description", apiField: "description", header: "DESCRIPTION", width: 240, editable: true },
  { key: "category", apiField: "category", header: "CATEGORY", width: 130, editable: true },
  { key: "denomination", apiField: "denomination", header: "DENOMINATION", width: 150, editable: true },
  { key: "quantityAuthorised", apiField: "quantity_authorised", header: "QUANTITY AUTHORISED", width: 190, editable: true },
  { key: "quantityAvailable", apiField: "quantity_available", header: "QUANTITY HELD", width: 150, editable: true },
  { key: "compartment", apiField: "compartment", header: "COMPARTMENT NAME", width: 190, editable: true },
  { key: "rackPosition", apiField: "rack_position", header: "RACK POSITION", width: 150, editable: true },
  { key: "rackNumber", apiField: "rack_number", header: "RACK NUMBER", width: 150, editable: true },
  { key: "location", apiField: "location", header: "BOX NUMBER", width: 150, editable: true },
  { key: "authority", apiField: "authority", header: "AUTHORITY", width: 170, editable: false },
  { key: "page", apiField: "page", header: "D787J PAGE NUMBER", width: 180, editable: true },
  { key: "line", apiField: "line", header: "D787J LINE NUMBER", width: 180, editable: true },
  { key: "critical", apiField: "critical", header: "CRITICAL", width: 120, editable: true },
  { key: "picturePath", apiField: "picture_path", header: "PICTURE PATH", width: 240, editable: true },
  { key: "remarks", apiField: "remarks", header: "REMARKS", width: 220, editable: true },
  { key: "shipCustomerCode", apiField: "ship_customer_code", header: "SHIP CUSTOMER CODE", width: 190, editable: false },
];

/** The seventeen a user may type into, in either mode. `services.IMPORT_EDITABLE_FIELDS` is the
 * same seventeen names server side, so a column can never be offered here and refused there —
 * the server answers an unknown field with a 400 rather than a silent drop, so the two lists
 * disagreeing is a visible failure and not a correction quietly going missing. */
export const EDITABLE_COLUMNS = IMPORT_COLUMNS.filter((column) => column.editable);

/** The status vocabulary the reference application used, in its own
 * casing - `master.html`'s results table rendered VALID, INVALID and DUPLICATE. The page had
 * been rendering the raw lower-case enum value straight out of the API. */
/** The four sources of truth a pattern number can be answered by, in the
 * words an operator would recognise rather than the wire's own codes. `resolve_pattern_sources`
 * checks them in this order and the first hit wins, so the label also says which register the
 * ship's answer actually came from. */
export const PATTERN_SOURCE_LABELS: Record<string, string> = {
  ITEM: "ILMS item master",
  MO_SOT: "the MO source of truth",
  WLMS: "WLMS",
  WED_SOT: "the WED source of truth",
};

export const STATUS_LABELS: Record<ExcelImportRowStatus, string> = {
  valid: "VALID",
  invalid: "INVALID",
  duplicate: "DUPLICATE",
};

export const STATUS_TONES: Record<ExcelImportRowStatus, string> = {
  valid: "success",
  invalid: "danger",
  duplicate: "warning",
};

/** The row tint, applied as a cell class to every column so the whole
 * row reads as one band. `data-grid` passes `columnDefs` through to ag-grid untouched, so this
 * needs nothing added to the shared component. The tint is never the only signal - the STATUS
 * column spells the same three words out. */
export const ROW_STATUS_CELL_CLASS: Record<ExcelImportRowStatus, string> = {
  valid: "obs-cell--row-valid",
  invalid: "obs-cell--row-invalid",
  duplicate: "obs-cell--row-duplicate",
};

/** TWO PRESENTATION STATES THAT ARE NOT STATUSES, and the reason they are
 * not.
 *
 * `status` answers "will this row be written". For both of these the answer is still no - clause
 * 4.3 keeps a pattern number no source of truth recognises out of the spares table, and a master
 * value nobody has confirmed has not been confirmed - so both remain `invalid`, both stay under
 * the Invalid Only tab, and both still block Save. Making either of them a fourth
 * `ExcelImportRowStatus` would have meant changing what the server counts, what the commit
 * skips and what the tabs filter on, to say something about colour.
 *
 * What they answer instead is "did this row break a rule of the document". A rating who left a
 * pattern number for the storekeeper to look up, and one who entered a denomination this ship
 * genuinely uses, did not - and painting all twenty of their columns the same red as a row that
 * really did breach clause 2.10 tells them the opposite. So the tint and the STATUS chip are
 * decided from the row rather than from `status` alone, and the ERRORS column carries the
 * reason in words either way, which is the non-colour signal WCAG 1.4.1 requires. */
export const PATTERN_ONLY_CELL_CLASS = "obs-cell--row-pattern-only";
export const NEEDS_CONFIRMATION_CELL_CLASS = "obs-cell--row-needs-confirmation";
export const PATTERN_ONLY_LABEL = "PATTERN NOT FOUND";
export const NEEDS_CONFIRMATION_LABEL = "NEEDS CONFIRMATION";

/** The tint for one row, which is the status tint unless one of the two states above applies.
 * Confirmation wins over the pattern state where a row is in both, because it is the one the
 * operator can clear from the save dialogue rather than by editing the cell. */
export function rowTintClass(row: ImportGridRow): string {
  if (row.needsMasterConfirmation) return NEEDS_CONFIRMATION_CELL_CLASS;
  if (row.patternOnlyError) return PATTERN_ONLY_CELL_CLASS;
  return ROW_STATUS_CELL_CLASS[row.status];
}

/** The key the STATUS column RENDERS, which is the row's status widened
 * by the two states above. It is a display key and never a status - nothing filters, counts or
 * commits on it, and `ImportGridRow.status` is untouched beside it.
 *
 * The shared `GridStatusChipRenderer` looks its label and tone up from the cell's own value, so
 * the column's `valueGetter` returns this and the two maps below extend the three statuses with
 * the two new keys. That keeps a renderer used by every SFD table out of this change entirely. */
export type ImportRowStateKey = ExcelImportRowStatus | "pattern_only" | "needs_confirmation";

export function rowStateKey(row: ImportGridRow): ImportRowStateKey {
  if (row.needsMasterConfirmation) return "needs_confirmation";
  if (row.patternOnlyError) return "pattern_only";
  return row.status;
}

export const ROW_STATE_LABELS: Record<ImportRowStateKey, string> = {
  ...STATUS_LABELS,
  pattern_only: PATTERN_ONLY_LABEL,
  needs_confirmation: NEEDS_CONFIRMATION_LABEL,
};

/** Both new states are `warning` and not `danger`: the row needs attention and has broken
 * nothing. */
export const ROW_STATE_TONES: Record<ImportRowStateKey, string> = {
  ...STATUS_TONES,
  pattern_only: "warning",
  needs_confirmation: "warning",
};

/** An in-file duplicate carries no rule error of its own - it is a row
 * the engine found perfectly valid and then met a second time. The ERRORS column would
 * otherwise be blank on the one row whose status most needs explaining. Written in the
 * application's own plain voice and stating the fix, per the register at RECON-09 A4.3, rather
 * than in the workbook's clause-led voice - there is no clause to lead with.
 *
 * "in this sheet" reads oddly for a table the operator typed by hand, so
 * the wording names the table rather than the file it may or may not have come from. */
export const DUPLICATE_ROW_MESSAGE =
  "This pattern number already appears on an earlier row of this table. Correct it, or delete this row.";

/** One row of the working table, flattened for the grid.
 *
 * `values` is what each column shows, `corrections` is the value the WORKBOOK held for any
 * cell the application corrected from a source of truth, and `errors` is every broken rule
 * for this row, one per line. Everything the four visual states need is decided once, here,
 * rather than recomputed inside a template expression on every change-detection pass. */
export interface ImportGridRow {
  row: number;
  status: ExcelImportRowStatus;
  /** Every line the ERRORS cell shows, joined. Kept because the column has a `field` and the
   * grid still sorts and filters on a plain value; the two arrays below are what the cell
   * actually renders, so that the two KINDS of line can be told apart by colour. */
  errors: string;
  /** THE BROKEN RULES - what the operator has to fix before this row can
   * be saved. Rendered in red. */
  errorList: string[];
  /** THE SENTENCES THE SAVE RESOLVES, not the operator - a master value
   * that will be added on save, or added once confirmed. Rendered in the ordinary text colour.
   * They used to arrive inside the errors and be painted the same red, which left a reader no
   * way to tell "correct this" from "this sorts itself out". */
  advisoryList: string[];
  /** `errorList` BY COLUMN rather than flattened, carried straight through from
   * `ExcelImportPreviewRow.fieldErrors` - the back end's own per-field keying (see that
   * interface's comment). This is what a broken rule is ABOUT rather than merely what it SAYS,
   * and `errorList`/`GridErrorsCell` cannot answer that: a sentence like "Pattern number did not
   * match ILMS/WLMS" names its own column in English, not in a key a caller can filter on. The
   * row editor reads this to show only the columns actually in the red - the same
   * `EDITABLE_COLUMNS` are still there for the confirmation/hand-entry stages */
  fieldErrors: Record<string, string[]>;
  patternUnmatched: boolean;
  /** the OTHER half of `patternMatched`, which the grid row never carried.
   * `patternUnmatched` collapses `true` and `null` into one untreated branch, so a pattern number
   * a source of truth CONFIRMED looked exactly like one nothing had checked. `patternSource`
   * names which of the four answered, for the tooltip - it is the non-colour half of the green,
   * and the one thing about a matched row the screen can say and nothing else can. */
  patternMatched: boolean;
  patternSource: string;
  /** See `rowTintClass` above - a row whose ONLY failure is an unrecognised pattern number,
   * and a row waiting on a master value the Head of Department has to confirm. Both are
   * `status === "invalid"` and neither broke a rule of the document. */
  patternOnlyError: boolean;
  needsMasterConfirmation: boolean;
  /** the one sentence of near-match help for a pattern number that was
   * typed and matched nothing, already composed. Empty string on every other row, which is
   * what `GridErrorsCell` tests before it renders anything. */
  patternSuggestion: string;
  corrections: Record<string, string>;
  values: Record<string, string>;
}

/** The near-match sentence, and the two shapes it takes.
 *
 * It is deliberately SEPARATE from the "Pattern number did not match ILMS/WLMS" line the rule
 * engine already puts in `errorList`. That sentence is the back end's, is compared against
 * character-for-character server-side to decide whether the row is tinted "PATTERN NOT FOUND"
 * rather than painted as a breach of the rules document, and must not gain a clause here.
 *
 * The second form is said out loud rather than left blank. A cell that says nothing reads as a
 * screen that has not finished thinking; "No near match found" tells the operator the lookup
 * ran and there is nothing to offer, so they stop waiting for it. */
export function patternSuggestionLine(codes: readonly string[]): string {
  if (!codes.length) return "No near match found.";
  return `Nearby matches to check before import — ${codes.join(", ")}`;
}

export function displayValue(data: ExcelImportRowData, key: keyof ExcelImportRowData): string {
  const value = data[key];
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "");
}

/** Every broken rule on this row, one per line.
 *
 * The strings are the back end's own, reproduced without a word added - they are clause-led
 * and, wherever the seven template workbooks already carry a data-validation message for the
 * same rule, they are that workbook's message verbatim, so the screen and the sheet a rating
 * filled in speak with one voice. Where several columns fail on one row, each gets its own
 * line, which is what the ERRORS cell's `white-space: pre-line` renders.
 *
 * A hand-built row reaches this function by exactly the same path - one rule engine, one set
 * of messages, one presentation. */
export function errorLines(row: ExcelImportPreviewRow): string[] {
  const lines = Object.values(row.fieldErrors ?? {}).flat();
  // An in-file duplicate carries no rule error of its own, and the ERRORS cell would otherwise
  // be blank on the one row whose status most needs explaining. It IS the operator's to fix -
  // correct the pattern number or delete the row - so it belongs with the errors, in red.
  if (row.status === "duplicate" && !lines.length) return [DUPLICATE_ROW_MESSAGE];
  return lines;
}

/** The advisory half, and the point of separating the two.
 *
 * These are the sentences the SAVE resolves rather than the operator - a master value that will
 * be added on save, or added once a Head of Department confirms it. They used to be appended
 * into `fieldErrors` server-side and arrive indistinguishable from a broken rule, so the ERRORS
 * cell painted "Pattern number did not match ILMS/WLMS" and "EQUIPMENT CLASS 'AIR CONDITIONING
 * PLANT' ... will be added when you save" in one block of the same red. Only the first of those
 * is anybody's to act on.
 *
 * Kept as its own function beside `errorLines` so the two are read together and neither can
 * quietly start carrying the other's lines. */
export function advisoryLines(row: ExcelImportPreviewRow): string[] {
  return Object.values(row.fieldAdvisories ?? {}).flat();
}

export function toGridRow(row: ExcelImportPreviewRow): ImportGridRow {
  const values: Record<string, string> = {};
  for (const column of IMPORT_COLUMNS) {
    values[column.apiField] = displayValue(row.data, column.key);
  }
  const corrections: Record<string, string> = {};
  for (const correction of row.corrections) {
    corrections[correction.field] = correction.original;
  }
  return {
    row: row.row,
    // The chip renderer maps this to STATUS_LABELS itself, through the `labelMap` the
    // column definition hands it, so the label is not carried on the row as well.
    status: row.status,
    errors: [...errorLines(row), ...advisoryLines(row)].join("\n"),
    errorList: errorLines(row),
    advisoryList: advisoryLines(row),
    fieldErrors: row.fieldErrors ?? {},
    // Only `false` is the unmatched state. `null` means the PATTERN NUMBER cell was left
    // empty, which clause 2.7.1 permits and which the application generates a number for —
    // rendering that red would accuse the user of an error they did not make.
    patternUnmatched: row.patternMatched === false,
    // `true` only. `null` is an empty cell, which clause 2.7.1 permits and the application
    // generates a number for - not the same thing as confirmed, and already reported by
    // `patternGenerated`.
    patternMatched: row.patternMatched === true,
    patternSource: row.patternSource ?? "",
    patternOnlyError: row.patternOnlyError,
    needsMasterConfirmation: row.needsMasterConfirmation,
    // composed only for a row whose pattern number was TYPED and matched
    // nothing. A matched row and an empty cell are told nothing, because there is nothing about
    // them to help with.
    patternSuggestion:
      row.patternMatched === false
        ? patternSuggestionLine(row.patternSuggestions)
        : "",
    corrections,
    values,
  };
}
